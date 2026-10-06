// Run with: npm run test:player-division  (Node 22+/24 strips types natively)
// Runs the BUNDLED API (server/apiEntrypoint.ts bundled like scripts/prepare-vercel-runtime.mjs, or the real
// server/apiRuntime.mjs when IDENTITY_TEST_USE_BUILT=1) against an in-memory stand-in for the Neon driver.
// No network, no production data, nothing is written outside the OS temp directory.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { resetFakeNeon, seedFakeNeon, dumpFakeNeon, fakeNeonWrites } from './support/fakeNeon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PITCHLINE_SESSION_SECRET = 'x'.repeat(48);
process.env.DATABASE_URL = 'postgres://fake/in-memory';
delete process.env.PITCHLINE_ADMIN_EMAIL;
register('./support/neonHooks.mjs', import.meta.url);
// ---- bundle the API (same transform and esbuild options as scripts/prepare-vercel-runtime.mjs) ----
const { createSessionToken } = await import('../server/auth.ts');
let apiUrl: string;
if (process.env.IDENTITY_TEST_USE_BUILT === '1') {
  apiUrl = pathToFileURL(path.join(root, 'server', 'apiRuntime.mjs')).href;
} else {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchline-identity-'));
  const entry = path.join(root, 'server', 'apiEntrypoint.ts');
  buildSync({
    stdin: { contents: fs.readFileSync(entry, 'utf8').replace("from './appdeployCompat';", "from './appdeployCompat.ts';").replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')"), resolveDir: path.dirname(entry), sourcefile: 'server/apiEntrypoint.ts', loader: 'ts' },
    outfile: path.join(outDir, 'apiRuntime.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'error',
  });
  // packages are external: link node_modules next to the bundle so non-neon imports resolve
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(outDir, 'node_modules'), 'junction');
  apiUrl = pathToFileURL(path.join(outDir, 'apiRuntime.mjs')).href;
}
const api = (await import(apiUrl)).default;
const server = http.createServer((req, res) => { api(req as never, res as never).catch(e => { console.error(e); res.statusCode = 500; res.end(); }); });
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const cookie = (userId: string) => 'pitchline_session=' + encodeURIComponent(createSessionToken({ userId, email: userId + '@test.local', name: userId }));
async function call(method: string, pathname: string, userId: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers: { cookie: cookie(userId), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const team = (id: string, name: string, ageGroup: string, extra: Rec = {}) => ({ id, name, ageGroup, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0, ...extra });

resetFakeNeon();
seedFakeNeon('auth_users', ['u-lfa', 'u-club'].map(id => ({ id, email: id + '@test.local', name: id })));
seedFakeNeon('user_roles', [{ id: 'r1', userId: 'u-lfa', role: 'LFA Admin' }, { id: 'r2', userId: 'u-club', role: 'Club', club: 'Rovers FC' }]);
seedFakeNeon('leagues', [{ id: 'L1', name: 'League', season: '2026', country: 'ZA', status: 'Active', createdAt: 1 }]);
seedFakeNeon('teams', [team('t1', 'Rovers U12', 'U12'), team('t2', 'Rovers U14', 'U14'), team('t3', 'United U12', 'U12')]);
seedFakeNeon('players', [{ id: 'old', name: 'Legacy Lee', team: 'Rovers U12', position: 'MF', number: 4, status: 'Fit', rating: 6, memberRef: 'M-old' }]);

const base = { name: 'Sam', team: 'Rovers U12', position: 'MF', number: 7, status: 'Fit', rating: 6, memberRef: 'M-sam' };
for (const user of ['u-club', 'u-lfa']) {
  const missing = await call('POST', '/api/players', user, base);
  assert.equal(missing.status, 400, `missing division as ${user}`);
  assert.match(missing.body.error || missing.body.message || JSON.stringify(missing.body), /division/i);
  assert.equal((await call('POST', '/api/players', user, { ...base, ageGroup: 'U99' })).status, 400, 'unknown division');
  assert.equal((await call('POST', '/api/players', user, { ...base, ageGroup: 'U14' })).status, 400, 'division does not match team');
}
assert.equal(dumpFakeNeon('players').length, 1, 'rejected requests stored nothing');

const ok = await call('POST', '/api/players', 'u-club', { ...base, ageGroup: 'U12' });
assert.ok(ok.status === 200 || ok.status === 201, 'valid create ' + ok.status);
assert.equal(ok.body.ageGroup, 'U12');
assert.equal((dumpFakeNeon('players') as Rec[]).find(p => p.name === 'Sam')!.ageGroup, 'U12', 'ageGroup stored');

assert.equal((await call('POST', '/api/players', 'u-club', { ...base, name: 'Intruder', team: 'United U12', ageGroup: 'U12' })).status, 403, 'club cannot add to another club');
assert.equal((await call('POST', '/api/players', 'u-club', { ...base, name: 'Nope', team: 'Rovers U14', ageGroup: 'Senior' })).status, 400);
const adminOk = await call('POST', '/api/players', 'u-lfa', { ...base, name: 'Admin Add', team: 'United U12', ageGroup: 'U12', memberRef: 'M-adm' });
assert.ok(adminOk.status === 200 || adminOk.status === 201);

const list = await call('GET', '/api/players', 'u-lfa');
assert.equal(list.status, 200);
const legacy = (list.body as Rec[]).find(p => p.id === 'old')!;
assert.ok(legacy && legacy.ageGroup === undefined, 'legacy player without ageGroup still lists, untouched');
assert.ok((list.body as Rec[]).some(p => p.name === 'Sam' && p.ageGroup === 'U12'));
const clubList = await call('GET', '/api/players', 'u-club');
assert.ok((clubList.body as Rec[]).some(p => p.id === 'old'), 'club still sees legacy player');

await new Promise(r => server.close(r));
console.log('player division tests passed');
server.closeAllConnections();
