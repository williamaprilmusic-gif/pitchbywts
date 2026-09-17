import fs from 'node:fs';

const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');

const ownerLine = "  const liveLockOwner = actor ? `${reqId}:${actor.userId}` : '';";
const stableOwnerLine = "  const liveLockOwner = actor && liveFixtureId ? `user:${actor.userId}:fixture:${liveFixtureId}` : '';";
if (api.includes(ownerLine)) api = api.replace(ownerLine, stableOwnerLine);

const oldRoutes="  const liveMutationRoutes = ['/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish'];";
const newRoutes="  const liveMutationRoutes = ['/api/live-match/start','/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish'];";
if(api.includes(oldRoutes)) api=api.replace(oldRoutes,newRoutes);

const acquireStart = api.indexOf("  const liveMutationRoutes = ['/api/live-match/start','/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish'];");
const duplicateStart = api.indexOf("  if (request.method === 'POST' && pathname === '/api/live-match/events-v2'", acquireStart + 1);
const lockBlockEnd = api.indexOf("\n\n", api.indexOf("  if (liveMutation && actor && liveFixtureId) {", acquireStart));
const finalAudit = "  if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request) });";

if (!api.includes('LIVE_LOCK_FINALLY_GUARD')) {
  if (acquireStart < 0 || duplicateStart < 0 || lockBlockEnd < 0 || !api.includes(finalAudit)) {
    throw new Error('Live lock finally patch: expected concurrency markers not found');
  }

  const beforeDuplicate = api.slice(0, duplicateStart);
  const acquisitionBlock = api.slice(acquireStart, lockBlockEnd + 2);
  const afterDuplicate = api.slice(duplicateStart);
  const earlyRelease = "        if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n";
  const cleanedAfterDuplicate = afterDuplicate.replaceAll(earlyRelease, '');
  const wrappedTail = cleanedAfterDuplicate.replace(
    finalAudit,
    `  // LIVE_LOCK_FINALLY_GUARD: every successfully acquired live-match lock is released here,\n  // including early returns and unexpected exceptions from any downstream handler.\n  } finally {\n    if (liveLockAcquired) {\n      try { await db.releaseLiveLock(liveFixtureId, liveLockOwner); }\n      catch (releaseError) { console.error('Pitchline live lock release failed', { requestId: reqId, fixtureId: liveFixtureId, error: releaseError }); }\n      liveLockAcquired = false;\n    }\n  }\n\n${finalAudit}`
  );

  api = beforeDuplicate + acquisitionBlock + '  try {\n' + wrappedTail;
} else {
  api = api.replace(oldRoutes,newRoutes).replace(ownerLine, stableOwnerLine);
}

fs.writeFileSync(apiPath, api);
console.log('Hardened every live-match mutation with a true try/finally lock-release guard, including Start Match.');
