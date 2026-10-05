// Run with: npm run test:identity  (Node 22+/24 strips types natively)
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
import { stampTeam, stampPlayer, stampFixture, pickTeamByName } from '../backend/leagueIdentity.ts';
import { resetFakeNeon, seedFakeNeon, dumpFakeNeon, fakeNeonWrites } from './support/fakeNeon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PITCHLINE_SESSION_SECRET = 'x'.repeat(48);
process.env.DATABASE_URL = 'postgres://fake/in-memory';
delete process.env.PITCHLINE_ADMIN_EMAIL;
register('./support/neonHooks.mjs', import.meta.url);
const { createSessionToken } = await import('../server/auth.ts');

// ---- pure helper checks ----
assert.equal(stampTeam({ id: 't', leagueId: 'L2', clubId: 'c', teamId: 't' }, 'L1', 'c'), null);
assert.deepEqual(stampTeam({ id: 't' }, 'L1', 'c'), { id: 't', leagueId: 'L1', clubId: 'c', teamId: 't' });
assert.deepEqual(stampTeam({ id: 't', competitionId: 'cB' }, 'L1', 'c'), { id: 't', competitionId: 'cB', clubId: 'c', teamId: 't' }, 'competition-only teams stay competition-only');
assert.equal(stampTeam({ id: 't', leagueId: 'L2', clubId: 'other', teamId: 't' }, 'L1', 'c'), null, 'existing clubId is never replaced');
assert.equal(stampFixture({ id: 'f', leagueId: 'L2', homeTeamId: 'a', awayTeamId: 'b' }, { id: 'x', leagueId: 'L1' }, { id: 'y' }, 'L1'), null);
assert.equal(stampPlayer({ id: 'p', leagueId: 'L2', clubId: 'c', teamId: 't', playerId: 'm', memberRef: 'm' }, { id: 'tt', clubId: 'zz', leagueId: 'L1' }, 'L1'), null);
const dupTeams = [{ id: 'a', name: 'Reds', leagueId: 'L1' }, { id: 'b', name: 'Reds', competitionId: 'cB' }];
assert.equal(pickTeamByName(dupTeams, 'Reds', { competitionId: 'cB' })?.id, 'b');
assert.equal(pickTeamByName(dupTeams, 'Reds', { leagueId: 'L1' })?.id, 'a');

// ---- bundle the API (same transform and esbuild options as scripts/prepare-vercel-runtime.mjs) ----
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

type Rec = Record<string, any>;
const tokenFor = (userId: string) => createSessionToken({ userId, email: userId + '@test.local', name: userId });
async function get(pathname: string, userId: string) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { headers: { cookie: 'pitchline_session=' + encodeURIComponent(tokenFor(userId)) } });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function post(pathname: string, userId: string) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method: 'POST', headers: { cookie: 'pitchline_session=' + encodeURIComponent(tokenFor(userId)), 'content-type': 'application/json' }, body: '{}' });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
function seedUsers() {
  seedFakeNeon('auth_users', ['u-lfa', 'u-sup'].map(id => ({ id, email: id + '@test.local', name: id })));
  seedFakeNeon('user_roles', [{ id: 'r1', userId: 'u-lfa', role: 'LFA Admin' }, { id: 'r2', userId: 'u-sup', role: 'Supporter' }]);
}
const team = (id: string, name: string, extra: Rec = {}) => ({ id, name, ageGroup: 'U13', played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0, ...extra });
const fixture = (id: string, home: string, away: string, extra: Rec = {}) => ({ id, home, away, date: '2026-11-01', time: '10:00', venue: 'Main', status: 'Scheduled', ...extra });
const player = (id: string, name: string, teamName: string, extra: Rec = {}) => ({ id, name, team: teamName, position: 'MF', number: 4, status: 'Active', rating: 6, memberRef: 'M-' + id, ...extra });
const byId = (rows: Rec[]) => new Map(rows.map(r => [r.id, r]));
const IDS = ['leagueId', 'competitionId', 'clubId', 'teamId', 'homeTeamId', 'awayTeamId', 'playerId'] as const;

// ===== Scenario 1: two competitions (a league L1 first, and a tournament-style league L2 / competition cB) =====
resetFakeNeon(); seedUsers();
seedFakeNeon('leagues', [{ id: 'L1', name: 'League A', season: '2026', country: 'ZA', status: 'Active', createdAt: 1 }, { id: 'L2', name: 'Cup B', season: '2026', country: 'ZA', status: 'Active', createdAt: 2 }]);
seedFakeNeon('competition_catalog', [{ id: 'cA', name: 'League A', type: 'League', legacyLeagueId: 'L1' }, { id: 'cB', name: 'Cup B', type: 'Tournament', isActive: true }]);
seedFakeNeon('clubs', [
  { id: 'kR', leagueId: 'L1', name: 'Reds', shortName: 'Reds', status: 'Active', createdAt: 1 },
  { id: 'kG', leagueId: 'L2', name: 'Greens', shortName: 'Greens', status: 'Active', createdAt: 1 },
]);
seedFakeNeon('teams', [
  team('tR', 'Reds U13', { leagueId: 'L1', clubId: 'kR', teamId: 'tR' }),
  team('tB', 'Blues U13', { leagueId: 'L1' }),                              // unstamped club/team ids, league A
  team('tG', 'Greens U13', { leagueId: 'L2', clubId: 'kG', teamId: 'tG' }),  // other league
  team('tY', 'Yellows U13', { competitionId: 'cB' }),                       // competition-only (tournament) team
  team('tN', 'Nameless U13'),                                               // nothing at all: gets default league
]);
seedFakeNeon('players', [
  player('p1', 'Ann', 'Reds U13', { leagueId: 'L1', clubId: 'kR', teamId: 'tR', playerId: 'M-p1' }),
  player('p2', 'Bob', 'Greens U13', { leagueId: 'L2', clubId: 'kG', teamId: 'tG', playerId: 'M-p2' }),
  player('p3', 'Cy', 'Yellows U13', { competitionId: 'cB' }),
  player('p4', 'Di', 'Blues U13'),
]);
seedFakeNeon('fixtures', [
  fixture('f1', 'Reds U13', 'Blues U13', { leagueId: 'L1' }),
  fixture('f2', 'Greens U13', 'Greens U13', { leagueId: 'L2', homeTeamId: 'tG', awayTeamId: 'tG' }),
  fixture('f3', 'Yellows U13', 'Yellows U13', { competitionId: 'cB' }),
  fixture('f4', 'Blues U13', 'Reds U13'),
]);
const before = { teams: byId(dumpFakeNeon('teams')), players: byId(dumpFakeNeon('players')), fixtures: byId(dumpFakeNeon('fixtures')), clubs: byId(dumpFakeNeon('clubs')) };

for (const user of ['u-lfa', 'u-sup', 'u-lfa']) {
  for (const route of ['/api/fixtures', '/api/teams', '/api/players']) {
    const r = await get(route, user);
    assert.equal(r.status, 200, `${route} as ${user} ${JSON.stringify(r.body)}`);
    assert.ok(Array.isArray(r.body), `${route} returns a list`);
  }
}
// NOTE: in the built bundle GET /api/fixtures and /api/teams are served by the public read handlers in server/apiEntrypoint.ts
// (no identity writes), so fixture stamping is exercised through the explicit admin reconcile route as well.
assert.equal((await post('/api/league-identity/reconcile', 'u-lfa')).status, 200);
const after = { teams: byId(dumpFakeNeon('teams')), players: byId(dumpFakeNeon('players')), fixtures: byId(dumpFakeNeon('fixtures')), clubs: byId(dumpFakeNeon('clubs')) };

// nothing that already had an id was re-parented
for (const ns of ['teams', 'players', 'fixtures', 'clubs'] as const) {
  for (const [id, was] of before[ns]) {
    const now = after[ns].get(id)!;
    for (const k of IDS) if (was[k] !== undefined && was[k] !== '') assert.equal(now[k], was[k], `${ns}/${id}.${k} must not change`);
  }
}
assert.equal(dumpFakeNeon('leagues').length, 2, 'no extra league created');
assert.equal(after.fixtures.get('f2')!.leagueId, 'L2');
assert.equal(after.teams.get('tG')!.leagueId, 'L2');
assert.equal(after.players.get('p2')!.leagueId, 'L2');
// competition-only records stay competition-only
assert.equal(after.teams.get('tY')!.leagueId, undefined);
assert.equal(after.teams.get('tY')!.competitionId, 'cB');
assert.equal(after.fixtures.get('f3')!.leagueId, undefined);
assert.equal(after.players.get('p3')!.leagueId, undefined);
// missing ids were stamped
assert.ok(after.teams.get('tB')!.clubId && after.teams.get('tB')!.teamId === 'tB', 'tB stamped');
assert.equal(after.teams.get('tB')!.leagueId, 'L1');
assert.equal(after.teams.get('tN')!.leagueId, 'L1', 'record with no parent gets the default league');
assert.equal(after.fixtures.get('f1')!.homeTeamId, 'tR');
assert.equal(after.fixtures.get('f1')!.awayTeamId, 'tB');
assert.equal(after.fixtures.get('f4')!.leagueId, 'L1');
assert.equal(after.players.get('p4')!.teamId, 'tB');
assert.equal(after.players.get('p4')!.leagueId, 'L1');
assert.equal(after.players.get('p3')!.teamId, 'tY');
// stamping is one-time: another round of list reads performs no writes
const writesBefore = fakeNeonWrites().length;
for (const route of ['/api/fixtures', '/api/teams', '/api/players']) await get(route, 'u-sup');
assert.equal(fakeNeonWrites().length, writesBefore, 'list routes are read-only once identity is stamped');

// ===== Scenario 2: single league, legacy un-stamped data: behaves as before =====
resetFakeNeon(); seedUsers();
seedFakeNeon('leagues', [{ id: 'L1', name: 'Only League', season: '2026', country: 'ZA', status: 'Active', createdAt: 1 }]);
seedFakeNeon('teams', [team('t1', 'Reds U13'), team('t2', 'Blues U13')]);
seedFakeNeon('players', [player('p1', 'Ann', 'Reds U13')]);
seedFakeNeon('fixtures', [fixture('f1', 'Reds U13', 'Blues U13')]);
assert.equal(((await get('/api/fixtures', 'u-sup')).body as Rec[]).length, 1);
const tm = (await get('/api/teams', 'u-lfa')).body as Rec[];
const pl = (await get('/api/players', 'u-lfa')).body as Rec[];
assert.equal((await post('/api/league-identity/reconcile', 'u-lfa')).status, 200);
const fx = dumpFakeNeon('fixtures') as Rec[];
const tmFull = dumpFakeNeon('teams') as Rec[];
assert.equal(fx.length, 1);
assert.deepEqual([fx[0].leagueId, fx[0].homeTeamId, fx[0].awayTeamId], ['L1', 't1', 't2']);
assert.ok(tmFull.every(t => t.leagueId === 'L1' && t.clubId && t.teamId === t.id));
assert.deepEqual([pl[0].leagueId, pl[0].teamId, pl[0].playerId, pl[0].clubId === tmFull.find(t => t.id === 't1')!.clubId], ['L1', 't1', 'M-p1', true]);
assert.equal(dumpFakeNeon('leagues').length, 1);
assert.equal(dumpFakeNeon('clubs').length, 2);

// ===== Scenario 3: no league at all: the default league is created exactly once =====
resetFakeNeon(); seedUsers();
seedFakeNeon('teams', [team('t1', 'Reds U13')]);
await get('/api/players', 'u-lfa'); await get('/api/players', 'u-sup'); await get('/api/players', 'u-lfa');
assert.equal(dumpFakeNeon('leagues').length, 1);
assert.equal(dumpFakeNeon('teams')[0].leagueId, dumpFakeNeon('leagues')[0].id);

await new Promise(r => server.close(r));
console.log('league identity tests passed');
server.closeAllConnections();
