import fs from 'node:fs';

const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');

if (!api.includes('LIVE_LOCK_FINALLY_GUARD')) {
  const routesMatch = api.match(/  const liveMutationRoutes = \[[^;]+\];/);
  const acquisitionStart = api.indexOf('  if (liveMutation && actor && liveFixtureId) {');
  const duplicateStart = api.indexOf("  if (request.method === 'POST' && pathname === '/api/live-match/events-v2'", acquisitionStart + 1);
  const finalAudit = "  if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request) });";
  if (!routesMatch || acquisitionStart < 0 || duplicateStart < 0 || !api.includes(finalAudit)) throw new Error('Live lock finally patch: expected concurrency markers not found');

  const routes = routesMatch[0];
  const normalizedRoutes = routes.replace(
    "['/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish']",
    "['/api/live-match/start','/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish']"
  );
  api = api.replace(routes, normalizedRoutes);

  const refreshedAcquire = api.indexOf('  if (liveMutation && actor && liveFixtureId) {');
  const refreshedDuplicate = api.indexOf("  if (request.method === 'POST' && pathname === '/api/live-match/events-v2'", refreshedAcquire + 1);
  if (refreshedAcquire < 0 || refreshedDuplicate < 0) throw new Error('Live lock finally patch: normalized markers not found');

  const prefix = api.slice(0, refreshedAcquire);
  const afterAcquire = api.slice(refreshedAcquire);
  const acquisitionEnd = afterAcquire.indexOf('\n\n', afterAcquire.indexOf('    }\n  }'));
  if (acquisitionEnd < 0) throw new Error('Live lock finally patch: acquisition block end not found');

  const acquisitionBlock = afterAcquire.slice(0, acquisitionEnd + 2);
  const tail = afterAcquire.slice(acquisitionEnd + 2);
  const cleanedTail = tail
    .replaceAll("        if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n", '')
    .replaceAll("  if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n", '');
  const body = cleanedTail.replace(finalAudit, '');

  const guard = `  const __pitchlineReleaseLiveLock = async () => {\n    if (!liveLockAcquired) return;\n    try {\n      await db.releaseLiveLock(liveFixtureId, liveLockOwner);\n    } catch (releaseError) {\n      console.error('Pitchline live lock release failed', { requestId: reqId, fixtureId: liveFixtureId, error: releaseError });\n    } finally {\n      liveLockAcquired = false;\n    }\n  };\n\n  try {\n`;
  const close = `  } finally {\n    await __pitchlineReleaseLiveLock();\n  }\n\n${finalAudit}\n}`;

  api = prefix + acquisitionBlock + guard + body + close;
}

fs.writeFileSync(apiPath, api);
console.log('Pitchline live-lock hardening: every live mutation lock now has one true outer try/finally release path, including Start Match, event mutations, undo, pause, resume and finish.');
