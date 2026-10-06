// Run with: npm run test:migration  (Node 22+/24 strips types natively)
// Runs the BUNDLED API (server/apiEntrypoint.ts bundled like scripts/prepare-vercel-runtime.mjs, or the real
// server/apiRuntime.mjs when MIGRATION_TEST_USE_BUILT=1) against an in-memory stand-in for the Neon driver.
// No network, no production data, nothing is written outside the OS temp directory.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { coerceCompetitionKind, competitionIsPublic, competitionSlug, normalizeCompetitionIds, normalizeUserRoleRow, isAcceptedRole, isGrantableRole, clubCompetitionId, buildClubCompetition, hasClubCompetition } from '../backend/competitionModel.ts';
import { resetFakeNeon, seedFakeNeon, dumpFakeNeon, fakeNeonWrites } from './support/fakeNeon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PITCHLINE_SESSION_SECRET = 'x'.repeat(48);
process.env.DATABASE_URL = 'postgres://fake/in-memory';
const OWNER_ENV = ' Owner@Test.local ';
process.env.PITCHLINE_ADMIN_EMAIL = OWNER_ENV;
register('./support/neonHooks.mjs', import.meta.url);
const { createSessionToken } = await import('../server/auth.ts');

// ---- pure helper checks ----
assert.equal(coerceCompetitionKind('Cup'), 'Cup');
assert.equal(coerceCompetitionKind('Tournament'), 'Tournament');
assert.equal(coerceCompetitionKind('League'), 'League');
assert.equal(coerceCompetitionKind(undefined), 'League');
assert.equal(coerceCompetitionKind('cup'), 'League', 'unknown spellings read as League, as before');
assert.equal(competitionIsPublic({ status: 'Setup' }), false);
assert.equal(competitionIsPublic({ status: 'Archived' }), false);
assert.equal(competitionIsPublic({ status: 'Live' }), true);
assert.equal(competitionIsPublic({ status: 'Setup', public: true }), true, 'a stored boolean wins');
assert.equal(competitionSlug({ name: 'League A', season: '2026' }), 'league-a-2026');
assert.equal(competitionSlug({ name: 'x', slug: 'kept' }), 'kept');
assert.deepEqual(normalizeCompetitionIds(['a', ' a ', '', 'b', 3]), ['a', 'b', '3']);
assert.deepEqual(normalizeCompetitionIds(undefined), []);
assert.deepEqual(normalizeUserRoleRow({ userId: 'u', role: 'LFA Admin' }).competitionIds, []);
for (const r of ['Supporter', 'Manager', 'Club', 'LFA Admin', 'Tournament Admin', 'Site Admin']) assert.ok(isAcceptedRole(r), r);
for (const r of ['Supporter', 'Manager', 'Club', 'LFA Admin']) assert.ok(isGrantableRole(r), r);
for (const r of ['Tournament Admin', 'Site Admin', 'root', '']) assert.ok(!isGrantableRole(r), r);
assert.equal(clubCompetitionId('k', 'c'), 'cc_k__c');
assert.deepEqual(buildClubCompetition('k', 'c', 5), { id: 'cc_k__c', clubId: 'k', competitionId: 'c', status: 'Active', joinedAt: 5 });
assert.ok(hasClubCompetition([{ clubId: 'k', competitionId: 'c', status: 'Removed' }], 'k', 'c'));

// ---- bundle the API (same transform and esbuild options as scripts/prepare-vercel-runtime.mjs) ----
let apiUrl: string;
if (process.env.MIGRATION_TEST_USE_BUILT === '1') {
  apiUrl = pathToFileURL(path.join(root, 'server', 'apiRuntime.mjs')).href;
} else {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchline-migration-'));
  const entry = path.join(root, 'server', 'apiEntrypoint.ts');
  buildSync({
    stdin: { contents: fs.readFileSync(entry, 'utf8').replace("from './appdeployCompat';", "from './appdeployCompat.ts';").replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')"), resolveDir: path.dirname(entry), sourcefile: 'server/apiEntrypoint.ts', loader: 'ts' },
    outfile: path.join(outDir, 'apiRuntime.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'error',
  });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(outDir, 'node_modules'), 'junction');
  apiUrl = pathToFileURL(path.join(outDir, 'apiRuntime.mjs')).href;
}
const api = (await import(apiUrl)).default;
const server = http.createServer((req, res) => { api(req as never, res as never).catch(e => { console.error(e); res.statusCode = 500; res.end(); }); });
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;

type Rec = Record<string, any>;
const tokenFor = (userId: string) => createSessionToken({ userId, email: userId + '@test.local', name: userId });
async function call(method: string, pathname: string, userId: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userId) headers.cookie = 'pitchline_session=' + encodeURIComponent(tokenFor(userId));
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Rec };
}
const migrate = (userId: string | null, body?: unknown) => call('POST', '/api/admin/migrate-tenancy', userId, body);
const NS = ['teams', 'fixtures', 'players', 'officials', 'venues', 'venue_availability', 'registrations', 'payments', 'invoices', 'communications', 'club_applications', 'announcements', 'training_sessions', 'club_invites', 'clubs', 'user_roles', 'competition_catalog', 'leagues', 'club_competitions'];
const snapshot = () => Object.fromEntries(NS.map(ns => [ns, dumpFakeNeon(ns)]));
const dataWrites = () => fakeNeonWrites().filter(w => w.namespace !== 'audit_log');
const byId = (rows: Rec[]) => new Map(rows.map(r => [r.id, r]));

function seedBase() {
  resetFakeNeon();
  seedFakeNeon('auth_users', ['owner', 'u-lfa', 'u-lfa2', 'u-sup'].map(id => ({ id, email: id + '@test.local', name: id })));
  seedFakeNeon('user_roles', [
    { id: 'r0', userId: 'owner', role: 'LFA Admin' }, // bootstrap admin stored as LFA Admin (unchanged in phase 2)
    { id: 'r1', userId: 'u-lfa', role: 'LFA Admin' },
    { id: 'r2', userId: 'u-lfa2', role: 'LFA Admin', competitionIds: ['cB'] },
    { id: 'r3', userId: 'u-sup', role: 'Supporter' },
  ]);
}

// ===== Scenario 1: two competitions; the default is created from leagues[0] =====
seedBase();
seedFakeNeon('leagues', [{ id: 'L1', name: 'League A', season: '2026', country: 'ZA', status: 'Active', createdAt: 1 }, { id: 'L2', name: 'Cup B', season: '2026', country: 'ZA', status: 'Active', createdAt: 2 }]);
seedFakeNeon('competition_catalog', [{ id: 'cB', name: 'Cup B', type: 'Cup', season: '2026', status: 'Live', legacyLeagueId: 'L2', isActive: false }]);
seedFakeNeon('clubs', [{ id: 'kR', leagueId: 'L1', name: 'Reds' }, { id: 'kG', leagueId: 'L2', name: 'Greens' }, { id: 'kN', name: 'Nobody' }]);
seedFakeNeon('teams', [
  { id: 'tR', name: 'Reds U13', clubId: 'kR' },
  { id: 'tG', name: 'Greens U13', clubId: 'kG', leagueId: 'L2' },
  { id: 'tY', name: 'Yellows U13', competitionId: 'cB' },
  { id: 'tU', name: 'Unknown U13', leagueId: 'L9' },
  { id: 'tX', name: 'Plain U13', clubId: 'kN' },
]);
seedFakeNeon('fixtures', [
  { id: 'f1', home: 'Reds U13', away: 'Plain U13', homeTeamId: 'tR' },
  { id: 'f2', home: 'Yellows U13', away: 'Yellows U13', competitionId: 'cB' },
  { id: 'f3', home: 'Greens U13', away: 'Reds U13', homeTeamId: 'tG' },
]);
seedFakeNeon('players', [
  { id: 'p1', name: 'Ann', team: 'Reds U13', teamId: 'tR' },
  { id: 'p2', name: 'Bob', team: 'Greens U13' },
  { id: 'p3', name: 'Cy', team: 'Yellows U13', competitionId: 'cB' },
]);
seedFakeNeon('officials', [{ id: 'o1', name: 'Ref One' }, { id: 'o2', name: 'Ref Two', competitionId: 'cB' }]);
seedFakeNeon('venues', [{ id: 'v1', name: 'Main' }]);
seedFakeNeon('invoices', [{ id: 'i1', club: 'Reds' }, { id: 'i2', club: 'Greens', clubId: 'kG' }]);
seedFakeNeon('club_invites', [{ id: 'ci1', code: 'ABC', club: 'Reds', role: 'Supporter' }]);

// access control: fail closed
assert.equal((await migrate(null)).status, 401, 'unauthenticated');
assert.equal((await migrate('u-lfa')).status, 403, 'stored LFA Admin is not the Site Admin');
assert.equal((await migrate('u-lfa2', { dryRun: false })).status, 403);
assert.equal((await migrate('u-sup', { dryRun: false })).status, 403);
{
  const saved = process.env.PITCHLINE_ADMIN_EMAIL; delete process.env.PITCHLINE_ADMIN_EMAIL;
  assert.equal((await migrate('owner')).status, 403, 'no PITCHLINE_ADMIN_EMAIL configured: nobody passes');
  process.env.PITCHLINE_ADMIN_EMAIL = saved;
}
assert.equal(dataWrites().length, 0, 'rejected calls write nothing');

// dry run (explicit and by default) changes nothing
const snap0 = snapshot();
for (const body of [undefined, {}, { dryRun: true }, { dryRun: 'false' }]) {
  const r = await migrate('owner', body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dryRun, true, 'defaults to dry run: ' + JSON.stringify(body));
}
assert.deepEqual(snapshot(), snap0, 'dry run changes no record');
assert.equal(dataWrites().length, 0, 'dry run performs no data writes');
const dry = (await migrate('owner')).body;
assert.equal(dry.defaultCompetition.action, 'create');
assert.equal(dry.defaultCompetition.created, false);
const expectWould: Record<string, number> = { teams: 3, fixtures: 2, players: 2, officials: 1, venues: 1, invoices: 2, club_invites: 1 };
for (const [ns, n] of Object.entries(expectWould)) assert.equal(dry.tables[ns].wouldStamp, n, `dry ${ns}`);
assert.equal(dry.tables.teams.unresolved, 1, 'leagueId with no catalog mapping is reported, not guessed');
assert.equal(dry.tables.teams.alreadySet, 1);
assert.equal(dry.tables.teams.stamped, 0);
assert.equal(dry.clubCompetitions.wouldInsert, 3);
assert.deepEqual([dry.userRoles.lfaAdminScanned, dry.userRoles.wouldSet, dry.userRoles.alreadySet], [3, 2, 1]);
assert.equal(dry.lossDetected, false);

// real run
const cBBefore = Object.fromEntries(NS.map(ns => [ns, dumpFakeNeon(ns).filter(r => r.competitionId === 'cB')]));
const counts0 = Object.fromEntries(NS.map(ns => [ns, dumpFakeNeon(ns).length]));
const real = await migrate('owner', { dryRun: false });
assert.equal(real.status, 200, JSON.stringify(real.body));
assert.equal(real.body.dryRun, false);
assert.equal(real.body.lossDetected, false);
assert.equal(real.body.defaultCompetition.created, true);
const defaultId = real.body.defaultCompetition.id as string;
assert.ok(defaultId && defaultId !== '(new default competition)');
for (const [ns, n] of Object.entries(expectWould)) { assert.equal(real.body.tables[ns].stamped, n, `real ${ns}`); assert.equal(real.body.tables[ns].wouldStamp, n); }
// before/after counts: nothing lost, only the default competition and the three club links were added
for (const ns of NS) {
  const extra = ns === 'competition_catalog' ? 1 : ns === 'club_competitions' ? 3 : 0;
  assert.equal(dumpFakeNeon(ns).length, counts0[ns] + extra, `record count ${ns}`);
  assert.deepEqual(real.body.recordCounts[ns], { before: counts0[ns], after: counts0[ns] + extra });
}
assert.equal(fakeNeonWrites().filter(w => w.op === 'delete').length, 0, 'never deletes');
// exact stamping
const T = byId(dumpFakeNeon('teams')), F = byId(dumpFakeNeon('fixtures')), P = byId(dumpFakeNeon('players'));
assert.equal(T.get('tR')!.competitionId, defaultId);
assert.equal(T.get('tG')!.competitionId, 'cB', 'league L2 maps to its own competition, not the default');
assert.equal(T.get('tG')!.leagueId, 'L2', 'existing fields untouched');
assert.equal(T.get('tY')!.competitionId, 'cB');
assert.equal(T.get('tU')!.competitionId, undefined, 'unmapped league left alone');
assert.equal(T.get('tX')!.competitionId, defaultId);
assert.deepEqual([F.get('f1')!.competitionId, F.get('f2')!.competitionId, F.get('f3')!.competitionId], [defaultId, 'cB', 'cB']);
assert.deepEqual([P.get('p1')!.competitionId, P.get('p2')!.competitionId, P.get('p3')!.competitionId], [defaultId, 'cB', 'cB']);
assert.deepEqual(byId(dumpFakeNeon('officials')).get('o1')!.competitionId, defaultId);
assert.equal(byId(dumpFakeNeon('officials')).get('o2')!.competitionId, 'cB');
assert.equal(byId(dumpFakeNeon('venues')).get('v1')!.competitionId, defaultId);
assert.equal(byId(dumpFakeNeon('invoices')).get('i1')!.competitionId, defaultId);
assert.equal(byId(dumpFakeNeon('invoices')).get('i2')!.competitionId, 'cB', 'club in the other competition');
assert.equal(byId(dumpFakeNeon('club_invites')).get('ci1')!.competitionId, defaultId);
for (const ns of NS) for (const was of cBBefore[ns]) assert.deepEqual(byId(dumpFakeNeon(ns)).get(was.id), was, `${ns}/${was.id} of another competition is never re-stamped`);
// default competition
const cat = dumpFakeNeon('competition_catalog');
const made = cat.find(c => c.id === defaultId)!;
assert.deepEqual([made.name, made.type, made.legacyLeagueId, made.isActive], ['League A', 'League', 'L1', true]);
assert.deepEqual(cat.find(c => c.id === 'cB'), { id: 'cB', name: 'Cup B', type: 'Cup', season: '2026', status: 'Live', legacyLeagueId: 'L2', isActive: false }, 'existing competition untouched');
assert.equal(dumpFakeNeon('leagues').length, 2);
// club links
const links = dumpFakeNeon('club_competitions').map(l => `${l.clubId}>${l.competitionId}`).sort();
assert.deepEqual(links, [`kG>cB`, `kN>${defaultId}`, `kR>${defaultId}`].sort());
assert.ok(dumpFakeNeon('club_competitions').every(l => l.status === 'Active' && typeof l.joinedAt === 'number'));
// roles
const roles = byId(dumpFakeNeon('user_roles'));
assert.deepEqual(roles.get('r1')!.competitionIds, [defaultId]);
assert.deepEqual(roles.get('r0')!.competitionIds, [defaultId]);
assert.deepEqual(roles.get('r2')!.competitionIds, ['cB'], 'existing competitionIds never overwritten');
assert.equal(roles.get('r3')!.competitionIds, undefined, 'only LFA Admin rows are touched');
assert.equal(roles.get('r0')!.role, 'LFA Admin', 'bootstrap admin stored role unchanged');
// audit
const audits = () => (dumpFakeNeon('audit_log') as Rec[]).filter(a => a.action === 'migrate-tenancy');
assert.equal(audits().length, 1, 'one audit entry for the real run, none for dry runs');
assert.equal(audits()[0].dryRun, false);

// second run is a no-op
const snap1 = snapshot();
const writesMark = dataWrites().length;
const again = await migrate('owner', { dryRun: false });
assert.equal(again.status, 200);
assert.equal(again.body.defaultCompetition.created, false);
assert.equal(again.body.defaultCompetition.id, defaultId);
for (const ns of Object.keys(expectWould)) { assert.equal(again.body.tables[ns].wouldStamp, 0, `rerun ${ns}`); assert.equal(again.body.tables[ns].stamped, 0); }
assert.deepEqual([again.body.clubCompetitions.wouldInsert, again.body.clubCompetitions.inserted, again.body.userRoles.wouldSet, again.body.userRoles.set], [0, 0, 0, 0]);
assert.deepEqual(snapshot(), snap1, 'second run changes nothing');
assert.equal(dataWrites().length, writesMark, 'second run performs no data writes');
assert.equal(again.body.tables.teams.unresolved, 1);

// the competition portfolio reads the new kinds and fields; existing rows read unchanged
const pf = await call('GET', '/api/competition-portfolio', 'u-lfa');
assert.equal(pf.status, 200);
const cBRead = pf.body.competitions.find((c: Rec) => c.id === 'cB');
assert.deepEqual([cBRead.type, cBRead.public, cBRead.slug], ['Cup', true, 'cup-b-2026']);
const madeRead = pf.body.competitions.find((c: Rec) => c.id === defaultId);
assert.equal(madeRead.type, 'League');
assert.equal(madeRead.public, true, 'Live row is public');
const leaguesBefore = dumpFakeNeon('leagues').length;
const createdCup = await call('POST', '/api/competition-portfolio', 'u-lfa', { name: 'Summer Cup', type: 'Cup', season: '2027' });
assert.equal(createdCup.status, 200, JSON.stringify(createdCup.body));
assert.deepEqual([createdCup.body.type, createdCup.body.public, createdCup.body.slug, createdCup.body.legacyLeagueId], ['Cup', false, 'summer-cup-2027', undefined]);
assert.equal(dumpFakeNeon('leagues').length, leaguesBefore, 'a Cup has no legacy league row');
assert.equal(dumpFakeNeon('competition_catalog').find(c => c.id === createdCup.body.id)!.type, 'Cup');
assert.equal((await call('POST', '/api/competition-portfolio', 'u-lfa', { name: 'Odd', type: 'Weird', season: '2027' })).body.type, 'League');
assert.equal((await call('POST', '/api/competition-portfolio', 'u-lfa', { name: 'Knock', type: 'Tournament', season: '2027' })).body.type, 'Tournament');

// ===== Scenario 2: an active catalog row is reused and never renamed =====
seedBase();
seedFakeNeon('leagues', [{ id: 'L1', name: 'League A', season: '2026', country: 'ZA', status: 'Active', createdAt: 1 }]);
seedFakeNeon('competition_catalog', [{ id: 'cKeep', name: 'Keep This Name', type: 'Tournament', season: '2026', status: 'Live', isActive: true }]);
seedFakeNeon('teams', [{ id: 't1', name: 'A U13' }]);
const catBefore = dumpFakeNeon('competition_catalog');
const r2 = await migrate('owner', { dryRun: false });
assert.equal(r2.status, 200, JSON.stringify(r2.body));
assert.deepEqual([r2.body.defaultCompetition.id, r2.body.defaultCompetition.action, r2.body.defaultCompetition.created], ['cKeep', 'reused-active', false]);
assert.deepEqual(dumpFakeNeon('competition_catalog'), catBefore, 'existing default competition not renamed or altered');
assert.equal(byId(dumpFakeNeon('teams')).get('t1')!.competitionId, 'cKeep');
assert.deepEqual(byId(dumpFakeNeon('user_roles')).get('r1')!.competitionIds, ['cKeep']);

// ===== Scenario 3: nothing to anchor a default on =====
seedBase();
const r3 = await migrate('owner', { dryRun: false });
assert.equal(r3.status, 409);
assert.equal(dataWrites().length, 0);

// ===== Scenario 4: the 5000-row listing cap is detected, and a real run refuses unless allowed =====
seedBase();
seedFakeNeon('leagues', [{ id: 'L1', name: 'League A', season: '2026', status: 'Active', createdAt: 1 }]);
seedFakeNeon('players', Array.from({ length: 5000 }, (_, i) => ({ id: 'bp' + String(i).padStart(4, '0'), name: 'P' + i })));
const capDry = await migrate('owner');
assert.equal(capDry.status, 200);
assert.deepEqual(capDry.body.capped, ['players']);
assert.ok(typeof capDry.body.warning === 'string' && capDry.body.warning.includes('players'));
const capReal = await migrate('owner', { dryRun: false });
assert.equal(capReal.status, 409);
assert.equal(dataWrites().length, 0, 'capped real run writes nothing');
assert.equal(dumpFakeNeon('competition_catalog').length, 0);
const capOk = await migrate('owner', { dryRun: false, allowCapped: true });
assert.equal(capOk.status, 200);
assert.equal(capOk.body.tables.players.stamped, 5000);

// ===== Scenario 5: the new roles cannot be granted =====
seedBase();
seedFakeNeon('leagues', [{ id: 'L1', name: 'League A', season: '2026', status: 'Active', createdAt: 1 }]);
seedFakeNeon('clubs', [{ id: 'kR', leagueId: 'L1', name: 'Reds' }]);
const rolesBefore = dumpFakeNeon('user_roles');
for (const role of ['Site Admin', 'Tournament Admin']) {
  const inv = await call('POST', '/api/invites', 'u-lfa', { role, club: 'Reds' });
  assert.equal(inv.status, 403, `invite for ${role}: ${JSON.stringify(inv.body)}`);
  const req = await call('POST', '/api/role-requests', 'u-sup', { requestedRole: role });
  assert.equal(req.status, 400, `role request for ${role}: ${JSON.stringify(req.body)}`);
}
assert.equal(dumpFakeNeon('club_invites').length, 0);
assert.equal(dumpFakeNeon('role_requests').length, 0);
// an approver cannot upgrade a request into the new roles either
const pending = await call('POST', '/api/role-requests', 'u-sup', { requestedRole: 'Manager' });
assert.equal(pending.status, 200, JSON.stringify(pending.body));
for (const role of ['Site Admin', 'Tournament Admin']) {
  const put = await call('PUT', `/api/role-requests/${pending.body.id}`, 'u-lfa', { status: 'Approved', role, club: 'Reds' });
  assert.equal(put.status, 400, `approving as ${role}: ${JSON.stringify(put.body)}`);
}
assert.deepEqual(dumpFakeNeon('user_roles'), rolesBefore, 'no role row changed');
// a forged open invite carrying a new role does not escalate through the join route
const future = Date.now() + 1000 * 60 * 60;
seedFakeNeon('club_invites', [
  { id: 'fi1', code: 'FORGED01', club: 'Reds', role: 'Site Admin', status: 'open', createdBy: 'u-lfa', createdAt: 1, expiresAt: future },
  { id: 'fi2', code: 'FORGED02', club: 'Reds', role: 'Tournament Admin', status: 'open', createdBy: 'u-lfa', createdAt: 1, expiresAt: future },
]);
for (const code of ['FORGED01', 'FORGED02']) {
  const j = await call('POST', `/api/invites/${code}/join`, 'u-sup');
  assert.notEqual(j.body?.role, 'Site Admin');
  assert.notEqual(j.body?.role, 'Tournament Admin');
  assert.equal(byId(dumpFakeNeon('user_roles')).get('r3')!.role, 'Supporter', `join ${code} leaves the Supporter a Supporter`);
}
assert.ok(!dumpFakeNeon('user_roles').some(r => ['Site Admin', 'Tournament Admin'].includes(r.role)), 'nobody holds a new role');
// and nobody reaches the migration through a role row alone
seedFakeNeon('user_roles', [{ id: 'r9', userId: 'u-sup', role: 'Site Admin' }]);
assert.equal((await migrate('u-sup')).status, 403, 'a stored Site Admin role grants nothing in phase 2');

await new Promise(r => server.close(r));
console.log('tenancy migration tests passed');
server.closeAllConnections();
