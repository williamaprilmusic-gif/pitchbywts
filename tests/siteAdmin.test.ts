// Run with: npm run test:site-admin  (Node 22+/24). Phase 7: Site Admin competition routes, club links, disabled
// competition-admin assignment and the public competition list. Uses the bundled API (or server/apiRuntime.mjs with
// SITE_ADMIN_TEST_USE_BUILT=1) over the in-memory Neon stand-in. No network, no production data.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { resetFakeNeon, seedFakeNeon, dumpFakeNeon, fakeNeonWrites } from './support/fakeNeon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PITCHLINE_SESSION_SECRET = 'x'.repeat(48);
process.env.DATABASE_URL = 'postgres://fake/in-memory';
process.env.PITCHLINE_ADMIN_EMAIL = 'owner@test.local';
register('./support/neonHooks.mjs', import.meta.url);
const { createSessionToken } = await import('../server/auth.ts');
const built = process.env.SITE_ADMIN_TEST_USE_BUILT === '1';

async function bundle(flagOn: boolean) {
  if (built) return (await import(pathToFileURL(path.join(root, 'server', 'apiRuntime.mjs')).href)).default;
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchline-site-admin-'));
  const entry = path.join(root, 'server', 'apiEntrypoint.ts');
  await build({
    stdin: { contents: fs.readFileSync(entry, 'utf8').replace("from './appdeployCompat';", "from './appdeployCompat.ts';").replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')"), resolveDir: path.dirname(entry), sourcefile: 'server/apiEntrypoint.ts', loader: 'ts' },
    outfile: path.join(outDir, 'apiRuntime.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'error',
    plugins: flagOn ? [{ name: 'flag-on', setup(b) { b.onLoad({ filter: /tenancyFlag\.ts$/ }, () => ({ contents: 'export const TENANCY_ENFORCED = true;', loader: 'ts' })); } }] : [],
  });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(outDir, 'node_modules'), 'junction');
  return (await import(pathToFileURL(path.join(outDir, 'apiRuntime.mjs')).href + (flagOn ? '?on' : ''))).default;
}
async function serve(api: any) {
  const server = http.createServer((req, res) => { api(req, res).catch((e: unknown) => { console.error(e); res.statusCode = 500; res.end(); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  type Rec = Record<string, any>;
  const call = async (method: string, pathname: string, userId: string | null, body?: unknown) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (userId) headers.cookie = 'pitchline_session=' + encodeURIComponent(createSessionToken({ userId, email: userId + '@test.local', name: userId }));
    const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as Rec };
  };
  const close = async () => { await new Promise(r => server.close(r)); server.closeAllConnections(); };
  return { call, close };
}

const ids = ['owner', 'u-lfa', 'u-tour', 'u-site', 'u-club', 'u-mgr', 'u-sup', 'u-new'];
function seed() {
  resetFakeNeon();
  seedFakeNeon('auth_users', ids.map(id => ({ id, email: id + '@test.local', name: id })));
  seedFakeNeon('user_roles', [
    { id: 'r0', userId: 'owner', role: 'Site Admin' },
    { id: 'r1', userId: 'u-lfa', role: 'LFA Admin' },
    { id: 'r2', userId: 'u-tour', role: 'Tournament Admin', competitionIds: ['cA'] },
    { id: 'r3', userId: 'u-site', role: 'Site Admin' }, // stored Site Admin on another email: no power
    { id: 'r4', userId: 'u-club', role: 'Club', club: 'Reds' },
    { id: 'r5', userId: 'u-mgr', role: 'Manager', club: 'Reds', team: 'Reds U13' },
    { id: 'r6', userId: 'u-sup', role: 'Supporter' },
  ]);
  seedFakeNeon('clubs', [{ id: 'kR', name: 'Reds' }, { id: 'kB', name: 'Blues' }]);
  seedFakeNeon('competition_catalog', [
    { id: 'cA', name: 'Cup A', type: 'Cup', season: '2026', status: 'Live', createdAt: 3 },
    { id: 'cB', name: 'League B', type: 'League', season: '2026', status: 'Live', public: true, createdAt: 2 },
    { id: 'cS', name: 'Setup C', type: 'Tournament', season: '2026', status: 'Setup', createdAt: 1 },
    { id: 'cH', name: 'Hidden D', type: 'League', season: '2026', status: 'Live', public: false, createdAt: 0 },
    { id: 'cX', name: 'Archived E', type: 'League', season: '2025', status: 'Archived', public: true, createdAt: 0 },
  ]);
}

// ================= flag OFF (shipping default) =================
{
  const { call, close } = await serve(await bundle(false));
  seed();
  const adminRoutes: Array<[string, string, unknown?]> = [
    ['GET', '/api/admin/competitions'],
    ['PUT', '/api/admin/competitions/cA', { public: true }],
    ['POST', '/api/club-competitions', { clubId: 'kR', competitionId: 'cA' }],
    ['DELETE', '/api/club-competitions/cc_kR__cA'],
    ['POST', '/api/admin/assign-competition-admin', { email: 'u-sup@test.local', kind: 'LFA Admin', competitionIds: ['cA'] }],
    ['POST', '/api/admin/revoke-competition-admin', { userId: 'u-tour' }],
  ];
  for (const [m, p, b] of adminRoutes) {
    assert.equal((await call(m, p, null, b)).status, 401, `${m} ${p} unauthenticated`);
    for (const actor of ['u-lfa', 'u-tour', 'u-site', 'u-club', 'u-mgr', 'u-sup']) assert.equal((await call(m, p, actor, b)).status, 403, `${m} ${p} by ${actor}`);
  }
  assert.equal(dumpFakeNeon('club_competitions').length, 0, 'forbidden callers wrote nothing');
  assert.equal(dumpFakeNeon('audit_log').filter(r => String(r.action).startsWith('site-admin.')).length, 0);

  // overview
  const ov = await call('GET', '/api/admin/competitions', 'owner');
  assert.equal(ov.status, 200); assert.equal(ov.body.tenancyEnforced, false);
  const byId = Object.fromEntries(ov.body.competitions.map((c: any) => [c.id, c]));
  assert.equal(byId.cA.kind, 'Cup'); assert.equal(byId.cS.public, false); assert.equal(byId.cB.public, true); assert.ok(byId.cA.slug);
  assert.deepEqual(byId.cA.admins, [{ userId: 'u-tour', role: 'Tournament Admin' }]);
  assert.equal(ov.body.competitions.length, 5);

  // edit
  assert.equal((await call('PUT', '/api/admin/competitions/nope', 'owner', { public: true })).status, 404);
  assert.equal((await call('PUT', '/api/admin/competitions/cA', 'owner', { public: 'yes' })).status, 400);
  assert.equal((await call('PUT', '/api/admin/competitions/cA', 'owner', { status: 'Bogus' })).status, 400);
  assert.equal((await call('PUT', '/api/admin/competitions/cA', 'owner', { name: '  ' })).status, 400);
  const ed = await call('PUT', '/api/admin/competitions/cA', 'owner', { public: true, name: 'Cup Alpha', slug: 'Cup Alpha 2026' });
  assert.equal(ed.status, 200); assert.equal(ed.body.public, true); assert.equal(ed.body.slug, 'cup-alpha-2026'); assert.equal(ed.body.name, 'Cup Alpha');
  assert.equal((await call('PUT', '/api/admin/competitions/cB', 'owner', { slug: 'cup-alpha-2026' })).status, 409, 'slug unique');
  assert.equal((await call('PUT', '/api/admin/competitions/cA', 'owner', { public: true, name: 'Cup Alpha', slug: 'cup-alpha-2026' })).status, 200, 'edit is idempotent');
  assert.equal(dumpFakeNeon('competition_catalog').find(c => c.id === 'cA')!.type, 'Cup', 'kind untouched');

  // links: validated + idempotent + audited
  assert.equal((await call('POST', '/api/club-competitions', 'owner', { clubId: 'kR' })).status, 400);
  assert.equal((await call('POST', '/api/club-competitions', 'owner', { clubId: 'ghost', competitionId: 'cA' })).status, 404);
  assert.equal((await call('POST', '/api/club-competitions', 'owner', { clubId: 'kR', competitionId: 'ghost' })).status, 404);
  assert.equal(dumpFakeNeon('club_competitions').length, 0);
  const l1 = await call('POST', '/api/club-competitions', 'owner', { clubId: 'kR', competitionId: 'cA' });
  assert.equal(l1.status, 201); assert.equal(l1.body.created, true); assert.equal(l1.body.id, 'cc_kR__cA');
  const l2 = await call('POST', '/api/club-competitions', 'owner', { clubId: 'kR', competitionId: 'cA' });
  assert.equal(l2.status, 200); assert.equal(l2.body.created, false);
  assert.equal(dumpFakeNeon('club_competitions').length, 1, 'no duplicate link');
  await call('POST', '/api/club-competitions', 'owner', { clubId: 'kR', competitionId: 'cB' });
  assert.equal(dumpFakeNeon('club_competitions').length, 2, 'one club can join several competitions');
  const ov2 = (await call('GET', '/api/admin/competitions', 'owner')).body.competitions.find((c: any) => c.id === 'cA');
  assert.deepEqual(ov2.clubs.map((c: any) => c.name), ['Reds']);
  assert.equal((await call('DELETE', '/api/club-competitions/missing', 'owner')).status, 404);
  const d1 = await call('DELETE', '/api/club-competitions/cc_kR__cA', 'owner');
  assert.equal(d1.status, 200); assert.equal(d1.body.removed, true);
  const d2 = await call('DELETE', '/api/club-competitions/cc_kR__cA', 'owner');
  assert.equal(d2.status, 200); assert.equal(d2.body.removed, false, 'unlink is idempotent');
  assert.equal(dumpFakeNeon('club_competitions').find(r => r.id === 'cc_kR__cA')!.status, 'Removed');
  assert.equal((await call('POST', '/api/club-competitions', 'owner', { clubId: 'kR', competitionId: 'cA' })).body.created, true, 'relink after unlink');
  const acts = dumpFakeNeon('audit_log').map(r => r.action);
  for (const a of ['site-admin.competition.update', 'site-admin.club-competition.link', 'site-admin.club-competition.unlink']) assert.ok(acts.includes(a), a);

  // assign / revoke: 409 and no writes while the flag is off
  const rolesBefore = JSON.stringify(dumpFakeNeon('user_roles')), auditBefore = dumpFakeNeon('audit_log').filter(r => r.action).length;
  const a1 = await call('POST', '/api/admin/assign-competition-admin', 'owner', { email: 'u-sup@test.local', kind: 'LFA Admin', competitionIds: ['cA'] });
  assert.equal(a1.status, 409); assert.equal(a1.body.error, 'Competition scoping is not enabled yet');
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', {})).status, 409, 'flag check precedes validation');
  assert.equal((await call('POST', '/api/admin/revoke-competition-admin', 'owner', { userId: 'u-tour' })).status, 409);
  assert.equal(JSON.stringify(dumpFakeNeon('user_roles')), rolesBefore, 'no role writes');
  assert.equal(dumpFakeNeon('audit_log').filter(r => r.action).length, auditBefore);

  // public competitions: unauthenticated, only public, Setup/Archived excluded
  const pub = await call('GET', '/api/competitions', null);
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.body.competitions.map((c: any) => c.id).sort(), ['cA', 'cB'].sort());
  for (const c of pub.body.competitions) assert.deepEqual(Object.keys(c).sort(), ['id', 'kind', 'name', 'season', 'status']);
  assert.deepEqual((await call('GET', '/api/competitions', 'u-sup')).body.competitions.length, 2);

  // new routes do not widen the existing grant paths
  for (const role of ['Site Admin', 'Tournament Admin']) assert.equal((await call('POST', '/api/invites', 'u-lfa', { role, club: 'Reds' })).status, 403);
  await close();
}

// ================= flag ON (source mode only: proves the enabled behaviour is safe) =================
if (!built) {
  const { call, close } = await serve(await bundle(true));
  seed();
  const base = { kind: 'Tournament Admin', competitionIds: ['cA'] };
  for (const actor of ['u-lfa', 'u-site', 'u-sup']) assert.equal((await call('POST', '/api/admin/assign-competition-admin', actor, { ...base, email: 'u-new@test.local' })).status, 403, actor);
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, kind: 'Site Admin', email: 'u-new@test.local' })).status, 400, 'Site Admin is not assignable');
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, competitionIds: [], email: 'u-new@test.local' })).status, 400);
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, competitionIds: ['ghost'], email: 'u-new@test.local' })).status, 400);
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, email: 'nobody@test.local' })).status, 404);
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, userId: 'owner', overwrite: true })).status, 403, 'bootstrap user untouched');
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, userId: 'u-site', overwrite: true })).status, 403, 'stored Site Admin row untouched');
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, userId: 'u-lfa' })).status, 409, 'no silent overwrite of another admin');
  assert.equal(dumpFakeNeon('user_roles').find(r => r.userId === 'u-lfa')!.role, 'LFA Admin');
  const ok = await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, email: 'U-New@test.local' });
  assert.equal(ok.status, 200);
  const row = dumpFakeNeon('user_roles').find(r => r.userId === 'u-new')!;
  assert.equal(row.role, 'Tournament Admin'); assert.deepEqual(row.competitionIds, ['cA']);
  assert.equal((await call('POST', '/api/admin/assign-competition-admin', 'owner', { ...base, userId: 'u-lfa', overwrite: true })).status, 200, 'explicit overwrite allowed');
  assert.ok(dumpFakeNeon('audit_log').some(r => r.action === 'site-admin.competition-admin.assign'));
  assert.equal((await call('POST', '/api/admin/revoke-competition-admin', 'owner', { userId: 'u-new' })).body.revoked, true);
  assert.equal((await call('POST', '/api/admin/revoke-competition-admin', 'owner', { userId: 'u-new' })).body.revoked, false, 'revoke idempotent');
  assert.equal((await call('POST', '/api/admin/revoke-competition-admin', 'owner', { userId: 'u-site' })).body.revoked, false, 'Site Admin row not revoked');
  assert.equal(dumpFakeNeon('user_roles').find(r => r.userId === 'u-site')!.role, 'Site Admin');
  await close();
}
void fakeNeonWrites;
console.log('site admin tests passed');
