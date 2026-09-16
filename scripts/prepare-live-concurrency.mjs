import fs from 'node:fs';

const compatPath = 'server/appdeployCompat.ts';
let compat = fs.readFileSync(compatPath, 'utf8');

const schemaMarker = "await db`CREATE INDEX IF NOT EXISTS pitchline_records_namespace_idx ON pitchline_records(namespace)`;";
const lockSchema = "await db`CREATE TABLE IF NOT EXISTS pitchline_live_locks (fixture_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, acquired_at BIGINT NOT NULL, expires_at BIGINT NOT NULL)`;await db`CREATE INDEX IF NOT EXISTS pitchline_live_locks_expiry_idx ON pitchline_live_locks(expires_at)`;";
if (!compat.includes('pitchline_live_locks')) {
  if (!compat.includes(schemaMarker)) throw new Error('Concurrency patch: schema marker not found');
  compat = compat.replace(schemaMarker, `${schemaMarker}${lockSchema}`);
  const marker = "};\n\nexport const ws =";
  const methods = `  async acquireLiveLock(fixtureId: string, ownerId: string, ttlMs = 30000) {\n    await ensureSchema();\n    const fixture = String(fixtureId || '').trim();\n    const owner = String(ownerId || '').trim();\n    if (!fixture || !owner) return false;\n    const timestamp = now();\n    const expires = timestamp + Math.max(5000, Math.min(120000, ttlMs));\n    const rows = await sql()\`\n      INSERT INTO pitchline_live_locks(fixture_id, owner_id, acquired_at, expires_at)\n      VALUES(\${fixture}, \${owner}, \${timestamp}, \${expires})\n      ON CONFLICT (fixture_id) DO UPDATE\n      SET owner_id = EXCLUDED.owner_id, acquired_at = EXCLUDED.acquired_at, expires_at = EXCLUDED.expires_at\n      WHERE pitchline_live_locks.expires_at <= \${timestamp} OR pitchline_live_locks.owner_id = \${owner}\n      RETURNING owner_id\n    \`;\n    return rows.length > 0 && String(rows[0].owner_id) === owner;\n  },\n  async releaseLiveLock(fixtureId: string, ownerId: string) {\n    await ensureSchema();\n    const fixture = String(fixtureId || '').trim();\n    const owner = String(ownerId || '').trim();\n    if (!fixture || !owner) return false;\n    const rows = await sql()\`DELETE FROM pitchline_live_locks WHERE fixture_id = \${fixture} AND owner_id = \${owner} RETURNING fixture_id\`;\n    return rows.length > 0;\n  }`;
  if (!compat.includes(marker)) throw new Error('Concurrency patch: db end marker not found');
  compat = compat.replace(marker, `,\n${methods}\n${marker}`);
  fs.writeFileSync(compatPath, compat);
}

const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');
if (!api.includes('acquireLiveLock')) {
  const duplicateMarker = "  if (request.method === 'POST' && pathname === '/api/live-match/events-v2' && actor && await isLfaAdmin(actor.userId)) {";
  // Do not lock /api/live-match/start here. That route has a dedicated Vercel
  // boundary handler which returns early after delegating to the legacy router,
  // bypassing the generic release section below. Locking it therefore leaves a
  // 30-second fixture lock and makes the immediately-following first event return
  // HTTP 409 live_match_busy. Start itself is already state-guarded by the backend.
  const lockCode = [
    "  const liveMutationRoutes = ['/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish'];",
    "  const liveMutation = mutation && liveMutationRoutes.includes(pathname);",
    "  const liveFixtureId = String(requestBody.fixtureId || '').trim();",
    "  const liveLockOwner = actor ? `${reqId}:${actor.userId}` : '';",
    "  let liveLockAcquired = false;",
    "  if (liveMutation && actor && liveFixtureId) {",
    "    liveLockAcquired = await db.acquireLiveLock(liveFixtureId, liveLockOwner, 30000);",
    "    if (!liveLockAcquired) {",
    "      send(response, 409, { error: 'Live match is busy. Another controller is updating this fixture; please retry.', code: 'live_match_busy', fixtureId: liveFixtureId }, reqId);",
    "      return;",
    "    }",
    "  }",
    "",
  ].join('\n');
  if (!api.includes(duplicateMarker)) throw new Error('Concurrency patch: duplicate marker not found');
  api = api.replace(duplicateMarker, `${lockCode}${duplicateMarker}`);

  const earlyReturn = "        send(response, 200, current, reqId);\n        await writeAudit({ requestId: reqId, actorId: actor.userId, actorEmail: actor.email, method: request.method || 'POST', path: pathname, outcome: 'idempotent-replay', duplicateEventId: duplicate.id, fixtureId, ip: requestIp(request) });\n        return;";
  const earlyNew = "        send(response, 200, current, reqId);\n        await writeAudit({ requestId: reqId, actorId: actor.userId, actorEmail: actor.email, method: request.method || 'POST', path: pathname, outcome: 'idempotent-replay', duplicateEventId: duplicate.id, fixtureId, ip: requestIp(request) });\n        if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n        return;";
  if (!api.includes(earlyReturn)) throw new Error('Concurrency patch: idempotent return not found');
  api = api.replace(earlyReturn, earlyNew);

  const releaseMarker = "  if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request) });";
  if (!api.includes(releaseMarker)) throw new Error('Concurrency patch: post-handler marker not found');
  api = api.replace(releaseMarker, "  if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n" + releaseMarker);
  fs.writeFileSync(apiPath, api);
}

// Recover a start request when a legacy/stale live_matches row exists but its
// update no longer finds the row. db.add is an upsert in the Neon compatibility
// layer, so retrying with the same id safely recreates the authoritative state.
const staleStartUpdate = "if (!updated?.[0]) { send(response, 500, { error: 'Could not start match', code: 'live_match_write_failed' }, reqId); return; }";
const staleStartRecovery = "if (!updated?.[0]) { const recoveredIds = await db.add('live_matches', [next]); if (!recoveredIds?.[0]) { send(response, 500, { error: 'Could not start match', code: 'live_match_write_failed' }, reqId); return; } id = String(recoveredIds[0]); }";
if (api.includes(staleStartUpdate)) {
  api = api.replace(staleStartUpdate, staleStartRecovery);
  fs.writeFileSync(apiPath, api);
}

// The legacy live-match routes share a notification helper that historically
// attempted ws.send([]) when nobody was subscribed. Make zero subscribers a
// normal no-op so realtime notification cannot turn a successful mutation into 500.
const backendPath = 'backend/index.ts';
let backend = fs.readFileSync(backendPath, 'utf8');
const unsafeNotify = "if(ids)await ws.send(ids,{v:1,type:'entity.update',payload:{entity_type:entityType,entity_id:entityId,data}});";
const safeNotify = "if(ids.length)await ws.send(ids,{v:1,type:'entity.update',payload:{entity_type:entityType,entity_id:entityId,data}});";
if (backend.includes(unsafeNotify)) {
  backend = backend.replace(unsafeNotify, safeNotify);
  fs.writeFileSync(backendPath, backend);
}

console.log('Applied Pitchline live-match concurrency, stale-state recovery and empty-subscriber notification protection.');
