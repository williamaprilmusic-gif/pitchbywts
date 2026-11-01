// Run with: npm run test:tenancy-enforcement  (Node 22.18+/24). Phase 5: competition scoping is ENFORCED. Verifies the
// lock-out-safe rules end to end over the bundled API and the in-memory Neon stand-in: a global admin (no competitionIds)
// and the bootstrap Site Admin keep full access; a competition-SCOPED admin sees and touches only their competitions; the
// ?competitionId= read filter narrows results; non-admin roles are unchanged. No network, no production data.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { resetFakeNeon, seedFakeNeon } from './support/fakeNeon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PITCHLINE_SESSION_SECRET = 'x'.repeat(48);
process.env.DATABASE_URL = 'postgres://fake/in-memory';
process.env.PITCHLINE_ADMIN_EMAIL = 'owner@test.local';
register('./support/neonHooks.mjs', import.meta.url);
const { createSessionToken } = await import('../server/auth.ts');

// Bundle the API with TENANCY_ENFORCED forced true, independent of the source default.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchline-tenancy-enf-'));
const entry = path.join(root, 'server', 'apiEntrypoint.ts');
await build({
  stdin: { contents: fs.readFileSync(entry, 'utf8').replace("from './appdeployCompat';", "from './appdeployCompat.ts';").replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')"), resolveDir: path.dirname(entry), sourcefile: 'server/apiEntrypoint.ts', loader: 'ts' },
  outfile: path.join(outDir, 'apiRuntime.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'error',
  plugins: [{ name: 'flag', setup(b) { b.onLoad({ filter: /tenancyFlag\.ts$/ }, () => ({ contents: 'export const TENANCY_ENFORCED = true;', loader: 'ts' })); } }],
});
fs.symlinkSync(path.join(root, 'node_modules'), path.join(outDir, 'node_modules'), 'junction');
const api = (await import(pathToFileURL(path.join(outDir, 'apiRuntime.mjs')).href)).default;
const server = http.createServer((req, res) => { api(req as never, res as never).catch((e: unknown) => { console.error(e); res.statusCode = 500; res.end(); }); });
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
type Rec = Record<string, any>;
async function call(method: string, pathname: string, userId: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userId) headers.cookie = 'pitchline_session=' + encodeURIComponent(createSessionToken({ userId, email: userId + '@test.local', name: userId }));
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Rec };
}
const names = (rows: Rec[]) => rows.map(r => String(r.name)).sort();
const ids = (rows: Rec[]) => rows.map(r => String(r.id)).sort();

function seed() {
  resetFakeNeon();
  seedFakeNeon('auth_users', ['owner', 'u-lfa', 'u-scoped', 'u-club', 'u-sup'].map(id => ({ id, email: id + '@test.local', name: id })));
  seedFakeNeon('user_roles', [
    { id: 'r0', userId: 'owner', role: 'Site Admin' },                                   // bootstrap email -> global
    { id: 'r1', userId: 'u-lfa', role: 'LFA Admin' },                                    // no competitionIds -> global (no lock-out)
    { id: 'r2', userId: 'u-scoped', role: 'Tournament Admin', competitionIds: ['cA'] },  // scoped to cA only
    { id: 'r3', userId: 'u-club', role: 'Club', club: 'Alpha' },
    { id: 'r4', userId: 'u-sup', role: 'Supporter' },
  ]);
  seedFakeNeon('leagues', [{ id: 'L1', name: 'League', season: '2026', status: 'Active', createdAt: 1 }]);
  seedFakeNeon('competition_catalog', [
    { id: 'cA', name: 'Cup A', type: 'Cup', status: 'Live', createdAt: 2 },
    { id: 'cB', name: 'League B', type: 'League', status: 'Live', createdAt: 1 },
  ]);
  const team = (id: string, name: string, competitionId: string): Rec => ({ id, name, ageGroup: 'U14', competitionId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 });
  seedFakeNeon('teams', [team('tA', 'Alpha', 'cA'), team('tB', 'Bravo', 'cB')]);
  const fixture = (id: string, home: string, away: string, competitionId: string): Rec => ({ id, home, away, date: '2026-05-01', time: '12:00', venue: 'Ground', status: 'upcoming', competitionId });
  seedFakeNeon('fixtures', [fixture('fA', 'Alpha', 'Alpha B', 'cA'), fixture('fB', 'Bravo', 'Bravo B', 'cB')]);
}

seed();

// ===== reads: /api/teams =====
// 1. Global admin (no competitionIds) and the bootstrap Site Admin see BOTH competitions — never locked out.
for (const u of ['u-lfa', 'owner']) assert.deepEqual(names((await call('GET', '/api/teams', u)).body), ['Alpha', 'Bravo'], `${u} sees all teams`);
// 2. A competition-scoped admin sees only teams in its competition.
assert.deepEqual(names((await call('GET', '/api/teams', 'u-scoped')).body), ['Alpha'], 'scoped admin: only cA teams');
// 3. The ?competitionId= filter narrows a global admin's view.
assert.deepEqual(names((await call('GET', '/api/teams?competitionId=cB', 'u-lfa')).body), ['Bravo']);
assert.deepEqual(names((await call('GET', '/api/teams?competitionId=cA', 'owner')).body), ['Alpha']);
// 4. A scoped admin asking for a competition outside its scope gets nothing (scope ∩ request).
assert.deepEqual((await call('GET', '/api/teams?competitionId=cB', 'u-scoped')).body, [], 'scoped admin cannot widen via query');
// 5. A supporter (non-admin) is unchanged: sees all teams.
assert.deepEqual(names((await call('GET', '/api/teams', 'u-sup')).body), ['Alpha', 'Bravo'], 'supporter unchanged');

// ===== reads: /api/fixtures =====
assert.deepEqual(ids((await call('GET', '/api/fixtures', 'u-lfa')).body), ['fA', 'fB'], 'global admin sees all fixtures');
assert.deepEqual(ids((await call('GET', '/api/fixtures', 'u-scoped')).body), ['fA'], 'scoped admin: only cA fixtures');
assert.deepEqual(ids((await call('GET', '/api/fixtures?competitionId=cB', 'u-lfa')).body), ['fB'], 'query filter on fixtures');
assert.deepEqual((await call('GET', '/api/fixtures?competitionId=cB', 'u-scoped')).body, [], 'scoped admin: no out-of-scope fixtures');

// ===== writes: the scoped fixture guard (GET /api/live-match/:id/rules is scopedFixtureAccess-guarded) =====
const denied = (r: { status: number; body: Rec }) => r.status === 403 && /do not have access to this fixture/.test(String(r.body?.error || ''));
// Global admin passes the guard for any competition's fixture.
for (const f of ['fA', 'fB']) assert.ok(!denied(await call('GET', `/api/live-match/${f}/rules`, 'u-lfa')), `global admin reaches ${f}`);
// Scoped admin: allowed inside its competition, blocked outside it.
assert.ok(!denied(await call('GET', '/api/live-match/fA/rules', 'u-scoped')), 'scoped admin reaches its own fixture');
assert.ok(denied(await call('GET', '/api/live-match/fB/rules', 'u-scoped')), 'scoped admin blocked from another competition');

// ===== my-access still reports the scope the enforcement uses =====
{
  const a = (await call('GET', '/api/my-access', 'u-scoped')).body;
  assert.deepEqual(a.competitionIds, ['cA']); assert.equal(a.isSiteAdmin, false);
  const g = (await call('GET', '/api/my-access', 'u-lfa')).body;
  assert.deepEqual(g.competitionIds, [], 'global admin advertises no competition limit');
  const s = (await call('GET', '/api/my-access', 'owner')).body;
  assert.equal(s.competitionIds, 'all');
}

// ===== flag on: Site Admin can now create a competition-scoped admin =====
assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { email: 'u-sup@test.local', kind: 'Tournament Admin', competitionIds: ['cB'] })).status, 200, 'assign enabled under enforcement');
assert.deepEqual(names((await call('GET', '/api/teams', 'u-sup')).body), ['Bravo'], 'the newly-scoped admin is now isolated to cB');

// ===== writes: the fixture generator respects competition scope (phase 5 close-out) =====
// Fresh seed: a registered venue and two U14 teams in cA so a league can be generated inside the scoped admin's competition.
seed();
seedFakeNeon('venues', [{ id: 'v1', name: 'Ground', location: 'Town', availability: 'Available' }]);
seedFakeNeon('teams', [
  { id: 'tA', name: 'Alpha', ageGroup: 'U14', competitionId: 'cA', played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 },
  { id: 'tA2', name: 'Alpha Reserves', ageGroup: 'U14', competitionId: 'cA', played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 },
  { id: 'tB', name: 'Bravo', ageGroup: 'U14', competitionId: 'cB', played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 },
]);
const genBody = (teams: string[]) => ({ format: 'league', legs: 1, startDate: '2026-05-02', weekday: 6, times: ['12:00'], venues: ['Ground'], ageGroup: 'U14', teams });
// Scoped admin (cA) may generate among its own competition's teams.
assert.equal((await call('POST', '/api/fixture-generator/preview', 'u-scoped', genBody(['Alpha', 'Alpha Reserves']))).status, 200, 'scoped admin generates within its competition');
// ...but is blocked from including a team from another competition.
{ const r = await call('POST', '/api/fixture-generator/preview', 'u-scoped', genBody(['Alpha', 'Bravo'])); assert.equal(r.status, 403, 'scoped admin blocked from cross-competition generation'); assert.match(String(r.body?.error || ''), /outside the competitions you administer/); }
// A global admin (no competitionIds) is never restricted by competition scope.
assert.equal((await call('POST', '/api/fixture-generator/preview', 'u-lfa', genBody(['Alpha', 'Bravo']))).status, 200, 'global admin generates across competitions');
// Commit is guarded the same way (blocked before anything is written).
assert.equal((await call('POST', '/api/fixture-generator/commit', 'u-scoped', { ...genBody(['Alpha', 'Bravo']), duplicateMode: 'skip' })).status, 403, 'scoped admin blocked at commit too');

// ===== manual single-fixture add: kick-off window, half length, and competition scope =====
const fx = (over: Rec = {}) => ({ home: 'Alpha', away: 'Alpha Reserves', date: '2026-05-02', time: '12:00', venue: 'Ground', ageGroup: 'U14', ...over });
assert.equal((await call('POST', '/api/fixtures', 'u-lfa', fx({ time: '16:00' }))).status, 400, 'kick-off after 15:30 rejected');
assert.equal((await call('POST', '/api/fixtures', 'u-lfa', fx({ time: '07:30' }))).status, 400, 'kick-off before 08:00 rejected');
assert.equal((await call('POST', '/api/fixtures', 'u-lfa', fx({ time: '13:00', halfLength: 12 }))).status, 400, 'half length off the 5-minute grid rejected');
// Scoped admin cannot add a fixture that pulls in another competition's team.
assert.equal((await call('POST', '/api/fixtures', 'u-scoped', fx({ away: 'Bravo', time: '14:00' }))).status, 403, 'scoped admin blocked from cross-competition fixture');
// A valid in-window, on-grid fixture is created.
assert.equal((await call('POST', '/api/fixtures', 'u-lfa', fx({ time: '15:30', halfLength: 30 }))).status, 200, 'valid fixture at the window edge created');

await new Promise(r => server.close(r));
console.log('tenancy phase 5 enforcement tests passed');
server.closeAllConnections();
