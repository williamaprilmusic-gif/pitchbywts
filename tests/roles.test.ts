// Run with: npm run test:roles  (Node 22+/24). Phase 3: the guards understand 'Site Admin' / 'Tournament Admin' but behave
// exactly as before for existing users. Uses the bundled API (or server/apiRuntime.mjs with ROLES_TEST_USE_BUILT=1) over the
// in-memory Neon stand-in. No network, no production data.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { isAdminRole, isSiteAdminRole, canonicalAdminRole, guardRole } from '../backend/roles.ts';
import { canGenerateFixtures } from '../backend/fixtureGenerator.ts';
import { resetFakeNeon, seedFakeNeon, dumpFakeNeon } from './support/fakeNeon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PITCHLINE_SESSION_SECRET = 'x'.repeat(48);
process.env.DATABASE_URL = 'postgres://fake/in-memory';
process.env.PITCHLINE_ADMIN_EMAIL = 'owner@test.local';
register('./support/neonHooks.mjs', import.meta.url);
const { createSessionToken } = await import('../server/auth.ts');

// ---- pure helpers ----
for (const r of ['LFA Admin', 'Tournament Admin', 'Site Admin']) { assert.ok(isAdminRole(r), r); assert.equal(canonicalAdminRole(r), 'LFA Admin'); assert.ok(canGenerateFixtures(r), r); }
for (const r of ['Club', 'Manager', 'Supporter', '', undefined, null, 'admin']) { assert.ok(!isAdminRole(r), String(r)); assert.ok(!canGenerateFixtures(r as string)); }
assert.ok(isSiteAdminRole('Site Admin')); assert.ok(!isSiteAdminRole('LFA Admin')); assert.ok(!isSiteAdminRole('Tournament Admin'));
assert.equal(canonicalAdminRole('Club'), 'Club');
assert.equal(guardRole('Supporter', 'OWNER@test.local'), 'LFA Admin', 'bootstrap email overrides the stored role');
assert.equal(guardRole('Supporter', 'someone@test.local'), 'Supporter');
assert.equal(guardRole(undefined, undefined), undefined);

// ---- bundle the API ----
let apiUrl: string;
if (process.env.ROLES_TEST_USE_BUILT === '1') apiUrl = pathToFileURL(path.join(root, 'server', 'apiRuntime.mjs')).href;
else {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchline-roles-'));
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
async function call(method: string, pathname: string, userId: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userId) headers.cookie = 'pitchline_session=' + encodeURIComponent(createSessionToken({ userId, email: userId + '@test.local', name: userId }));
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Rec };
}
const ids = ['owner', 'u-lfa', 'u-tour', 'u-site', 'u-club', 'u-mgr', 'u-sup', 'u-none'];
function seed() {
  resetFakeNeon();
  seedFakeNeon('auth_users', ids.map(id => ({ id, email: id + '@test.local', name: id })));
  seedFakeNeon('user_roles', [
    { id: 'r0', userId: 'owner', role: 'Supporter' }, // bootstrap email with a non-admin stored role
    { id: 'r1', userId: 'u-lfa', role: 'LFA Admin' }, // empty competitionIds must still pass in phase 3
    { id: 'r2', userId: 'u-tour', role: 'Tournament Admin', competitionIds: [] },
    { id: 'r3', userId: 'u-site', role: 'Site Admin' },
    { id: 'r4', userId: 'u-club', role: 'Club', club: 'Reds' },
    { id: 'r5', userId: 'u-mgr', role: 'Manager', club: 'Reds', team: 'Reds U13' },
    { id: 'r6', userId: 'u-sup', role: 'Supporter' },
  ]);
  seedFakeNeon('leagues', [{ id: 'L1', name: 'League A', season: '2026', status: 'Active', createdAt: 1 }]);
  seedFakeNeon('clubs', [{ id: 'kR', leagueId: 'L1', name: 'Reds' }]);
  seedFakeNeon('competition_catalog', [{ id: 'cA', name: 'Cup A', type: 'Cup', status: 'Live' }, { id: 'cB', name: 'League B', type: 'League', status: 'Live' }]);
}

// ===== guarded routes: admin-only (requireLfaAdmin), admin+club (requireAnyRole), apiEntrypoint isLfaAdmin =====
seed();
const adminOnly = ['GET /api/access-management', 'GET /api/audit-log'];
const adminOrClub = ['GET /api/registrations', 'GET /api/payments'];
const admins = ['u-lfa', 'u-tour', 'u-site', 'owner'];
for (const r of adminOnly) {
  const [m, p] = r.split(' ');
  assert.equal((await call(m, p, null)).status, p === '/api/audit-log' ? 403 : 401, `${r} unauthenticated (audit-log has always answered 403)`);
  for (const u of admins) assert.equal((await call(m, p, u)).status, 200, `${r} as ${u}`);
  for (const u of ['u-club', 'u-mgr', 'u-sup', 'u-none']) assert.equal((await call(m, p, u)).status, 403, `${r} as ${u}`);
}
for (const r of adminOrClub) {
  const [m, p] = r.split(' ');
  assert.equal((await call(m, p, null)).status, 401, `${r} unauthenticated`);
  for (const u of [...admins, 'u-club']) assert.equal((await call(m, p, u)).status, 200, `${r} as ${u}`);
  for (const u of ['u-mgr', 'u-sup']) assert.equal((await call(m, p, u)).status, 403, `${r} as ${u}`);
}
// fixture generator (requireLfaAdmin + requireFixtureGenerator): the guards must pass, so anything but 401/403 is a pass
for (const u of admins) { const s = (await call('POST', '/api/fixture-generator/preview', u, {})).status; assert.ok(s !== 401 && s !== 403, `generator as ${u}: ${s}`); }
for (const u of ['u-club', 'u-mgr', 'u-sup']) assert.equal((await call('POST', '/api/fixture-generator/preview', u, {})).status, 403, `generator as ${u}`);
assert.equal((await call('POST', '/api/fixture-generator/preview', null, {})).status, 401);
// live-operator path guard (apiEntrypoint isMatchOperator): admins and managers get past it, club/supporter stop at it
const operatorDenied = (r: { status: number; body: Rec }) => r.status === 403 && r.body?.error === 'Match operator role required';
for (const u of [...admins, 'u-mgr']) { const r = await call('POST', '/api/live-match/pause', u, { fixtureId: 'nope' }); assert.ok(!operatorDenied(r), `live pause as ${u}: ${JSON.stringify(r.body)}`); }
for (const u of ['u-club', 'u-sup']) { const r = await call('POST', '/api/live-match/pause', u, { fixtureId: 'nope' }); assert.ok(operatorDenied(r), `live pause as ${u}: ${JSON.stringify(r.body)}`); }
// finance (getProtectedInvoices): admin kinds and the bootstrap email read invoices; manager/supporter do not
for (const u of admins) assert.equal((await call('GET', '/api/invoices', u)).status, 200, `invoices as ${u}`);
for (const u of ['u-mgr', 'u-sup']) assert.equal((await call('GET', '/api/invoices', u)).status, 403, `invoices as ${u}`);
// a stored Tournament/Site Admin is treated as LFA Admin by the scoped routes (getRoleAssignment canonicalises)
for (const u of ['u-tour', 'u-site']) assert.equal((await call('GET', '/api/teams', u)).status, 200);
// reads never rewrite stored rows
assert.equal(dumpFakeNeon('user_roles').find(r => r.id === 'r2')!.role, 'Tournament Admin');
assert.equal(dumpFakeNeon('user_roles').find(r => r.id === 'r0')!.role, 'Supporter', 'reads never rewrite the bootstrap stored role (only sign-in does, see test:bootstrap)');

// ===== /api/my-role and /api/my-access shapes =====
const mr = async (u: string) => (await call('GET', '/api/my-role', u)).body;
for (const [u, stored] of [['u-lfa', 'LFA Admin'], ['u-tour', 'Tournament Admin'], ['u-site', 'Site Admin']]) {
  const b = await mr(u); assert.equal(b.role, 'LFA Admin', `${stored} reads as LFA Admin for old clients`); assert.equal(b.canonicalRole, 'LFA Admin'); assert.equal(b.isSiteAdmin, false, u);
}
{ const b = await mr('owner'); assert.equal(b.isSiteAdmin, true); assert.equal(b.canonicalRole, 'LFA Admin'); }
{ const b = await mr('u-club'); assert.equal(b.role, 'Club'); assert.equal(b.canonicalRole, 'Club'); assert.equal(b.isSiteAdmin, false); }
{ const b = await mr('u-sup'); assert.equal(b.role, 'Supporter'); assert.equal(b.isSiteAdmin, false); }
assert.equal((await call('GET', '/api/my-role', null)).status, 401);
assert.equal((await call('GET', '/api/my-access', null)).status, 401);
{
  const o = (await call('GET', '/api/my-access', 'owner')).body;
  assert.equal(o.role, 'Site Admin'); assert.equal(o.canonicalRole, 'LFA Admin'); assert.equal(o.isSiteAdmin, true); assert.equal(o.competitionIds, 'all'); assert.equal(o.competitions.length, 2);
  const l = (await call('GET', '/api/my-access', 'u-lfa')).body;
  assert.equal(l.role, 'LFA Admin'); assert.equal(l.canonicalRole, 'LFA Admin'); assert.equal(l.isSiteAdmin, false); assert.deepEqual(l.competitionIds, []); assert.deepEqual(l.competitions, []);
  const f = (await call('GET', '/api/my-access', 'u-site')).body; // stored 'Site Admin' on a non-bootstrap user: ordinary admin only
  assert.equal(f.role, 'LFA Admin'); assert.equal(f.canonicalRole, 'LFA Admin'); assert.equal(f.isSiteAdmin, false); assert.notEqual(f.competitionIds, 'all');
  const t = (await call('GET', '/api/my-access', 'u-tour')).body;
  assert.equal(t.role, 'Tournament Admin'); assert.equal(t.canonicalRole, 'LFA Admin'); assert.equal(t.isSiteAdmin, false);
  const s = (await call('GET', '/api/my-access', 'u-sup')).body;
  assert.equal(s.role, 'Supporter'); assert.equal(s.canonicalRole, 'Supporter'); assert.deepEqual(s.competitionIds, []);
  seedFakeNeon('user_roles', [{ id: 'r7', userId: 'u-none', role: 'Tournament Admin', competitionIds: ['cA'] }]);
  const n = (await call('GET', '/api/my-access', 'u-none')).body;
  assert.deepEqual(n.competitionIds, ['cA']); assert.deepEqual(n.competitions.map((c: Rec) => [c.id, c.kind]), [['cA', 'Cup']]);
}

// ===== new roles are not grantable =====
seed();
for (const role of ['Site Admin', 'Tournament Admin']) {
  for (const actor of ['u-lfa', 'u-tour', 'u-site', 'owner']) assert.equal((await call('POST', '/api/invites', actor, { role, club: 'Reds' })).status, 403, `invite ${role} by ${actor}`);
  assert.equal((await call('POST', '/api/role-requests', 'u-sup', { requestedRole: role })).status, 400, `request ${role}`);
}
assert.equal(dumpFakeNeon('club_invites').length, 0);
// admin kinds can still create ordinary invites exactly like an LFA Admin
for (const actor of ['u-lfa', 'u-tour', 'u-site']) assert.equal((await call('POST', '/api/invites', actor, { role: 'Manager', club: 'Reds' })).status, 200, `invite by ${actor}`);
const pend = await call('POST', '/api/role-requests', 'u-sup', { requestedRole: 'Manager' });
for (const role of ['Site Admin', 'Tournament Admin']) assert.equal((await call('PUT', `/api/role-requests/${pend.body.id}`, 'u-tour', { status: 'Approved', role, club: 'Reds' })).status, 400);
// forged invites carrying admin roles cannot be joined, and a stored admin is never downgraded by joining an invite
const future = Date.now() + 3600_000;
seedFakeNeon('club_invites', [
  { id: 'f1', code: 'FORGED01', club: 'Reds', role: 'Site Admin', status: 'open', createdBy: 'u-lfa', createdAt: 1, expiresAt: future },
  { id: 'f2', code: 'FORGED02', club: 'Reds', role: 'Tournament Admin', status: 'open', createdBy: 'u-lfa', createdAt: 1, expiresAt: future },
  { id: 'f3', code: 'FORGED03', club: 'Reds', role: 'LFA Admin', status: 'open', createdBy: 'u-lfa', createdAt: 1, expiresAt: future },
  { id: 'f4', code: 'PLAIN001', club: 'Reds', role: 'Club', status: 'open', createdBy: 'u-lfa', createdAt: 1, expiresAt: future },
]);
for (const code of ['FORGED01', 'FORGED02', 'FORGED03']) assert.equal((await call('POST', `/api/invites/${code}/join`, 'u-sup')).status, 403, code);
assert.equal(dumpFakeNeon('user_roles').find(r => r.userId === 'u-sup')!.role, 'Supporter');
await call('POST', '/api/invites/PLAIN001/join', 'u-tour');
assert.equal(dumpFakeNeon('user_roles').find(r => r.userId === 'u-tour')!.role, 'Tournament Admin', 'stored Tournament Admin is not downgraded by an invite');

await new Promise(r => server.close(r));
console.log('role guard tests passed');
server.closeAllConnections();
