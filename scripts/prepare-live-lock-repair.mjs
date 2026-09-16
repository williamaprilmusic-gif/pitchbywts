import fs from 'node:fs';

const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');

const oldOwner = "const liveLockOwner = actor ? `${reqId}:${actor.userId}` : '';";
const newOwner = "const liveLockOwner = actor && liveFixtureId ? `user:${actor.userId}:fixture:${liveFixtureId}` : '';";
if (api.includes(oldOwner)) api = api.replace(oldOwner, newOwner);
api = api.replaceAll('db.acquireLiveLock(liveFixtureId, liveLockOwner, 30000)', 'db.acquireLiveLock(liveFixtureId, liveLockOwner, 10000)');
fs.writeFileSync(apiPath, api);

const compatPath = 'server/appdeployCompat.ts';
let compat = fs.readFileSync(compatPath, 'utf8');
compat = compat.replaceAll('ttlMs = 30000', 'ttlMs = 10000');
fs.writeFileSync(compatPath, compat);

console.log('Repaired live-match lock ownership: sequential actions from the same authenticated controller now share the fixture lock, with a 10-second stale-lock window.');
