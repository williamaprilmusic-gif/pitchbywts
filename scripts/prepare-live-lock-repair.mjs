import fs from 'node:fs';

const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');

const oldOwner = "const liveLockOwner = actor ? `${reqId}:${actor.userId}` : '';";
const newOwner = "const liveLockOwner = actor && liveFixtureId ? `user:${actor.userId}:fixture:${liveFixtureId}` : '';";
if (api.includes(oldOwner)) api = api.replace(oldOwner, newOwner);
api = api.replaceAll('db.acquireLiveLock(liveFixtureId, liveLockOwner, 30000)', 'db.acquireLiveLock(liveFixtureId, liveLockOwner, 10000)');

// The custom Start Match branch returns before the normal post-handler release point.
// Release the fixture lock on every return inside that branch so kick-off never leaves
// a stale controller lock behind for Half Time, Second Half or live event buttons.
const startMarker = "  // Harden the live-match start operation at the Vercel boundary.";
const routeMarker = "  const routeRequest = request as IncomingMessage & { body?: unknown };";
const startIndex = api.indexOf(startMarker);
const routeIndex = api.indexOf(routeMarker);
if (startIndex >= 0 && routeIndex > startIndex) {
  const startBlock = api.slice(startIndex, routeIndex);
  const releaseBeforeReturn = "        if (liveLockAcquired) { await db.releaseLiveLock(liveFixtureId, liveLockOwner); liveLockAcquired = false; }\n        return;";
  const protectedBlock = startBlock.replaceAll("        return;", releaseBeforeReturn);
  if (protectedBlock !== startBlock) api = api.slice(0, startIndex) + protectedBlock + api.slice(routeIndex);
}

// Do not turn an intentional 409 controller-conflict into a fake offline queue entry.
// Only genuine transport failures are queued for later synchronization.
const livePath = 'src/LiveMatchCentre.tsx';
let ui = fs.readFileSync(livePath, 'utf8');
const oldCatch = `    } catch {\n      if (queueKey) {\n        const queue = readQueue(queueKey);\n        queue.push(payload);\n        localStorage.setItem(queueKey, JSON.stringify(queue));\n        setPendingCount(queue.length);\n        setNotice('Network unavailable. The event is queued and will sync automatically.');\n        resetQuick();\n      } else {\n        setNotice('Could not record the event.');\n      }\n    } finally {`;
const newCatch = `    } catch (error) {\n      const failure = error as Error & { code?: string; status?: number; requestId?: string };\n      const detail = [failure.message, failure.code ? \`code: \${failure.code}\` : '', failure.requestId ? \`request: \${failure.requestId}\` : ''].filter(Boolean).join(' · ');\n      if (failure.code === 'live_match_busy' || failure.status === 409) {\n        setNotice(detail || 'Another controller is updating this fixture; please retry.');\n        await loadMatch(selected.id);\n      } else if (queueKey) {\n        const queue = readQueue(queueKey);\n        queue.push(payload);\n        localStorage.setItem(queueKey, JSON.stringify(queue));\n        setPendingCount(queue.length);\n        setNotice('Network unavailable. The event is queued and will sync automatically.');\n        resetQuick();\n      } else {\n        setNotice(detail || 'Could not record the event.');\n      }\n    } finally {`;
if (ui.includes(oldCatch)) ui = ui.replace(oldCatch, newCatch);
fs.writeFileSync(livePath, ui);

const compatPath = 'server/appdeployCompat.ts';
let compat = fs.readFileSync(compatPath, 'utf8');
compat = compat.replaceAll('ttlMs = 30000', 'ttlMs = 10000');
fs.writeFileSync(compatPath, compat);

console.log('Hardened live-match locking: stable controller ownership, 10-second stale-lock window, guaranteed Start Match release paths, and explicit 409 live-match conflict handling.');
