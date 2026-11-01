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

await new Promise(r => server.close(r));
console.log('tenancy phase 5 enforcement tests passed');
server.closeAllConnections();
