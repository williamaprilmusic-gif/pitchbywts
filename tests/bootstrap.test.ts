// Run with: npm run test:bootstrap  (Node 22+/24). Phase 4: the bootstrap account's stored role is 'Site Admin' and it can
// never be locked out whatever its role row contains. Uses the bundled API (or server/apiRuntime.mjs with BOOTSTRAP_TEST_USE_BUILT=1)
// over the in-memory Neon stand-in. No network, no production data.
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { planBootstrapRole } from '../backend/bootstrapRole.ts';
import { resetFakeNeon, seedFakeNeon, dumpFakeNeon } from './support/fakeNeon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.PITCHLINE_SESSION_SECRET = 'x'.repeat(48);
process.env.DATABASE_URL = 'postgres://fake/in-memory';
process.env.PITCHLINE_ADMIN_EMAIL = 'Owner@test.local';
process.env.PITCHLINE_ADMIN_PASSWORD = 'owner-password-123';
register('./support/neonHooks.mjs', import.meta.url);
const { createSessionToken, passwordHash } = await import('../server/auth.ts');

// ---- pure planner ----
{
  const now = 5;
  const rows = [{ id: 'a', userId: 'o', role: 'LFA Admin', club: 'Reds', competitionIds: ['c1'], team: 'T' }, { id: 'b', userId: 'x', role: 'Club' }];
  const p = planBootstrapRole(rows, 'o', now);
  assert.equal(p.updates.length, 1); assert.equal(p.add, undefined);
  assert.deepEqual(p.updates[0].record, { id: 'a', userId: 'o', role: 'Site Admin', club: 'Reds', competitionIds: ['c1'], team: 'T', updatedAt: now, source: 'Vercel bootstrap administrator' });
  assert.deepEqual(planBootstrapRole([{ id: 'a', userId: 'o', role: 'Site Admin' }], 'o', now), { updates: [] });
  const add = planBootstrapRole([{ id: 'b', userId: 'x', role: 'Club' }], 'o', now);
  assert.equal(add.add?.role, 'Site Admin'); assert.equal(add.updates.length, 0);
}

// ---- bundle the API ----
let apiUrl: string;
if (process.env.BOOTSTRAP_TEST_USE_BUILT === '1') apiUrl = pathToFileURL(path.join(root, 'server', 'apiRuntime.mjs')).href;
else {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchline-bootstrap-'));
  const entry = path.join(root, 'server', 'apiEntrypoint.ts');
  buildSync({
    stdin: { contents: fs.readFileSync(entry, 'utf8').replace("from './appdeployCompat';", "from './appdeployCompat.ts';").replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')"), resolveDir: path.dirname(entry), sourcefile: 'server/apiEntrypoint.ts', loader: 'ts' },
    outfile: path.join(outDir, 'apiRuntime.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'error',
  });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(outDir, 'node_modules'), 'junction');
  apiUrl = pathToFileURL(path.join(outDir, 'apiRuntime.mjs')).href;
}
const api = (await import(apiUrl)).default;
// Vercel pre-parses JSON bodies onto req.body (the auth endpoints read it there); mimic that, leaving the stream consumed.
const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8'); try { (req as { body?: unknown }).body = text ? JSON.parse(text) : undefined; } catch { /* leave undefined */ }
  api(req as never, res as never).catch(e => { console.error(e); res.statusCode = 500; res.end(); });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
type Rec = Record<string, any>;
async function raw(method: string, pathname: string, cookie: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method, headers, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body) });
  const text = await res.text();
  const setCookie = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).find(c => c.startsWith('pitchline_session=')) || null;
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Rec, cookie: setCookie };
}
const OWNER_EMAIL = 'owner@test.local';
const signIn = (email = OWNER_EMAIL, password = process.env.PITCHLINE_ADMIN_PASSWORD!) => raw('POST', '/api/auth/sign-in', null, { email, password });
const asCookie = (userId: string, email: string, iat?: number) => 'pitchline_session=' + encodeURIComponent(createSessionToken({ userId, email, name: userId, ...(iat ? { iat } : {}) }));
const ownerRows = () => dumpFakeNeon('user_roles').filter(r => r.userId === 'owner');
const others = () => dumpFakeNeon('user_roles').filter(r => r.userId !== 'owner');

function seedBase(ownerRoleRows: Rec[]) {
  resetFakeNeon();
  seedFakeNeon('auth_users', [
    { id: 'owner', email: OWNER_EMAIL, name: 'Pitchline Administrator', passwordHash: passwordHash(process.env.PITCHLINE_ADMIN_PASSWORD!) },
    { id: 'u-fake', email: 'fake@test.local', name: 'fake' }, { id: 'u-lfa', email: 'lfa@test.local', name: 'lfa' }, { id: 'u-sup', email: 'sup@test.local', name: 'sup' },
  ]);
  seedFakeNeon('user_roles', [
    ...ownerRoleRows,
    { id: 'r-fake', userId: 'u-fake', role: 'Site Admin', competitionIds: ['cA'] },
    { id: 'r-lfa', userId: 'u-lfa', role: 'LFA Admin', club: 'Reds' },
    { id: 'r-sup', userId: 'u-sup', role: 'Supporter' },
  ]);
  seedFakeNeon('competition_catalog', [{ id: 'cA', name: 'Cup A', type: 'Cup', status: 'Live' }]);
}

// ===== lock-out matrix: every possible stored state of the bootstrap role row =====
const states: Array<[string, Rec[]]> = [
  ['missing', []],
  ['LFA Admin', [{ id: 'r0', userId: 'owner', role: 'LFA Admin', club: 'Keep FC', competitionIds: ['cKeep'], team: 'Keep U9' }]],
  ['Site Admin', [{ id: 'r0', userId: 'owner', role: 'Site Admin', updatedAt: 111, source: 'Vercel bootstrap administrator' }]],
  ['Supporter', [{ id: 'r0', userId: 'owner', role: 'Supporter' }]],
  ['garbage', [{ id: 'r0', userId: 'owner', role: 'banana' }]],
  ['lowercase', [{ id: 'r0', userId: 'owner', role: 'site admin' }]],
  ['empty role', [{ id: 'r0', userId: 'owner' }]],
  ['non-string role', [{ id: 'r0', userId: 'owner', role: { x: 1 } }]],
  ['duplicate rows', [{ id: 'r0', userId: 'owner', role: 'Supporter' }, { id: 'r00', userId: 'owner', role: 'Club', club: 'Reds' }]],
];
const adminOnly = ['/api/access-management', '/api/audit-log', '/api/invoices'];
for (const [label, rows] of states) {
  seedBase(rows);
  const before = JSON.stringify(others());
  // the bare signed session reaches admin routes even BEFORE sign-in rewrites anything
  for (const p of adminOnly) assert.equal((await raw('GET', p, asCookie('owner', OWNER_EMAIL))).status, 200, `${p} bare session (${label})`);
  const sess = await signIn();
  assert.equal(sess.status, 200, `sign-in (${label})`);
  assert.ok(sess.cookie, `session cookie (${label})`);
  assert.equal(sess.body.user.email, OWNER_EMAIL);
  for (const p of adminOnly) assert.equal((await raw('GET', p, sess.cookie)).status, 200, `${p} after sign-in (${label})`);
  const mine = ownerRows();
  assert.ok(mine.length >= 1 && mine.every(r => r.role === 'Site Admin'), `stored role is Site Admin after sign-in (${label}): ${JSON.stringify(mine)}`);
  if (label === 'LFA Admin') { const r0 = mine.find(r => r.id === 'r0')!; assert.deepEqual(r0.competitionIds, ['cKeep']); assert.equal(r0.team, 'Keep U9'); assert.equal(r0.club, 'Keep FC'); }
  assert.equal(JSON.stringify(others()), before, `other users' rows untouched (${label})`);
  // responses stay backwards compatible
  const mr = (await raw('GET', '/api/my-role', sess.cookie)).body;
  assert.equal(mr.role, 'LFA Admin', `my-role role (${label})`); assert.equal(mr.canonicalRole, 'LFA Admin'); assert.equal(mr.isSiteAdmin, true);
  const ma = (await raw('GET', '/api/my-access', sess.cookie)).body;
  assert.equal(ma.role, 'Site Admin'); assert.equal(ma.canonicalRole, 'LFA Admin'); assert.equal(ma.isSiteAdmin, true); assert.equal(ma.competitionIds, 'all');
  assert.equal((await raw('GET', '/api/auth/me', sess.cookie)).body.role, 'LFA Admin');
}

// ===== repeated sign-ins do not write again; credentials are not rewritten or revoked needlessly =====
seedBase([{ id: 'r0', userId: 'owner', role: 'LFA Admin' }]);
await signIn();
const snapRoles = JSON.stringify(dumpFakeNeon('user_roles')); const snapUsers = JSON.stringify(dumpFakeNeon('auth_users'));
const first = await signIn();
for (let i = 0; i < 3; i++) await signIn();
assert.equal(JSON.stringify(dumpFakeNeon('user_roles')), snapRoles, 'repeat sign-ins do not rewrite role rows');
assert.equal(JSON.stringify(dumpFakeNeon('auth_users')), snapUsers, 'repeat sign-ins do not rewrite the account');
assert.equal(dumpFakeNeon('auth_users').find(u => u.id === 'owner')!.sessionsValidAfter, undefined, 'no needless revocation');
assert.equal((await raw('GET', '/api/access-management', first.cookie)).status, 200, 'older session still valid after later sign-ins');

// ===== password change still revokes older sessions (only a real change) =====
seedBase([{ id: 'r0', userId: 'owner', role: 'Supporter' }]);
const old = await signIn();
await new Promise(r => setTimeout(r, 1100));
process.env.PITCHLINE_ADMIN_PASSWORD = 'owner-password-456';
const fresh = await signIn();
assert.equal(fresh.status, 200);
assert.ok(Number(dumpFakeNeon('auth_users').find(u => u.id === 'owner')!.sessionsValidAfter) > 0, 'password change sets sessionsValidAfter');
assert.equal((await raw('GET', '/api/access-management', old.cookie)).status, 401, 'session issued before the password change is revoked');
assert.equal((await raw('GET', '/api/access-management', fresh.cookie)).status, 200, 'new session works');
assert.equal(ownerRows().every(r => r.role === 'Site Admin'), true);
assert.equal((await signIn(OWNER_EMAIL, 'owner-password-123')).status, 401, 'old password no longer signs in');
process.env.PITCHLINE_ADMIN_PASSWORD = 'owner-password-123';

// ===== a stored 'Site Admin' on anyone else gains nothing =====
seedBase([{ id: 'r0', userId: 'owner', role: 'Site Admin' }]);
const fake = asCookie('u-fake', 'fake@test.local');
{
  const mr = (await raw('GET', '/api/my-role', fake)).body; assert.equal(mr.isSiteAdmin, false); assert.equal(mr.role, 'LFA Admin');
  const ma = (await raw('GET', '/api/my-access', fake)).body; assert.equal(ma.isSiteAdmin, false); assert.equal(ma.role, 'LFA Admin'); assert.notEqual(ma.competitionIds, 'all');
  assert.equal((await raw('POST', '/api/admin/migrate-tenancy', fake, {})).status, 403, 'no site console power');
  assert.notEqual((await raw('POST', '/api/admin/migrate-tenancy', asCookie('owner', OWNER_EMAIL), { dryRun: true })).status, 403, 'bootstrap keeps site power');
}
assert.equal(dumpFakeNeon('user_roles').find(r => r.id === 'r-fake')!.role, 'Site Admin', 'foreign Site Admin row untouched');
// nothing can grant it
for (const actor of [asCookie('owner', OWNER_EMAIL), asCookie('u-lfa', 'lfa@test.local')]) assert.equal((await raw('POST', '/api/invites', actor, { role: 'Site Admin', club: 'Reds' })).status, 403);
assert.equal((await raw('POST', '/api/role-requests', asCookie('u-sup', 'sup@test.local'), { requestedRole: 'Site Admin' })).status, 400);

await new Promise(r => server.close(r));
console.log('bootstrap role tests passed');
server.closeAllConnections();
