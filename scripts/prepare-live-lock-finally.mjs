import fs from 'node:fs';

const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');

if (!api.includes('LIVE_LOCK_FINALLY_GUARD')) {
  const routesMatch = api.match(/  const liveMutationRoutes = \[[^;]+\];/);
  const acquisitionStart = api.indexOf('  if (liveMutation && actor && liveFixtureId) {');
  const finalAudit = "  if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request) });";

  if (!routesMatch || acquisitionStart < 0 || !api.includes(finalAudit)) throw new Error('Live lock finally patch: expected concurrency markers not found');

  const routes = routesMatch[0];
  const normalizedRoutes = routes.replace(
    "['/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish']",
    "['/api/live-match/start','/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish']"
  );
  api = api.replace(routes, normalizedRoutes);

  const refreshedAcquire = api.indexOf('  if (liveMutation && actor && liveFixtureId) {');
  if (refreshedAcquire < 0) throw new Error('Live lock finally patch: normalized acquisition marker not found');

  const prefix = api.slice(0, refreshedAcquire);
  const afterAcquire = api.slice(refreshedAcquire);
  const acquisitionClose = afterAcquire.indexOf('\n\n', afterAcquire.indexOf('    }\n  }'));
  if (acquisitionClose < 0) throw new Error('Live lock finally patch: acquisition block end not found');

  const acquisitionBlock = afterAcquire.slice(0, acquisitionClose + 2);
  const tail = afterAcquire.slice(acquisitionClose + 2);

  const cleanedTail = tail
    .replaceAll("        if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n", '')
    .replaceAll("  if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n", '');

  // The original api() function's final `}` belongs outside the outer try/finally.
  const bodyWithoutAudit = cleanedTail.replace(finalAudit, '');
  const body = bodyWithoutAudit.replace(/\n}\s*$/s, '\n');

  const guard = `  // LIVE_LOCK_FINALLY_GUARD: every acquired live mutation lock is released here.\n  const __pitchlineReleaseLiveLock = async () => {\n    if (!liveLockAcquired) return;\n    try {\n      await db.releaseLiveLock(liveFixtureId, liveLockOwner);\n    } catch (releaseError) {\n      console.error('Pitchline live lock release failed', { requestId: reqId, fixtureId: liveFixtureId, error: releaseError });\n    } finally {\n      liveLockAcquired = false;\n    }\n  };\n\n  try {\n`;
  const close = `  } finally {\n    await __pitchlineReleaseLiveLock();\n  }\n\n${finalAudit}\n}`;

  // Move acquisition under the same outer try/finally so a partial DB failure during
  // acquisition cannot bypass the release guard. Early returns still execute finally.
  const acquisitionWithTry = acquisitionBlock.replace('  if (liveMutation && actor && liveFixtureId) {', '  if (liveMutation && actor && liveFixtureId) {');
  api = prefix + guard + acquisitionWithTry + body + close;
}

fs.writeFileSync(apiPath, api);
console.log('Pitchline live-lock hardening: every live mutation lock now has one true outer try/finally release path, including Start Match, event mutations, undo, pause, resume and finish.');
