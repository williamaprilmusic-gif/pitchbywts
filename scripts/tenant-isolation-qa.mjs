// Tenant isolation QA scaffold. NOT wired into CI and NOT part of `npm run build`.
// Run manually against a LOCAL or PREVIEW deployment, never against production data you care about:
//   PITCHLINE_BASE_URL=http://localhost:3000 TENANT_QA_ENABLE=1 \
//   TENANT_QA_SITE_EMAIL=... TENANT_QA_SITE_PASSWORD=... (and the other pairs below) node scripts/tenant-isolation-qa.mjs
// Credentials come only from the environment. Never commit them (this repository is public).
//
// Seeding plan (done by a human or a later seed script on a disposable database):
//   Competition A = a LEAGUE, competition B = a TOURNAMENT, each with its own teams, fixtures and players.
//   Accounts (env prefix in brackets):
//     [SITE]       Site Admin: session email equals PITCHLINE_ADMIN_EMAIL; sees A and B.
//     [LFA_A]      LFA Admin with competitionIds = [A]; must never see B.
//     [TOUR_B]     Tournament Admin with competitionIds = [B]; must never see A.
//     [CLUB_A]     Club linked (club_competitions) to A only.
//     [CLUB_AB]    Club linked to A and B; sees both.
//     [MGR_A]      Manager of a team in A.
//     [SUPPORTER]  Supporter; may browse both competitions (fixtures, standings, live, results).
//
// Phase 0/1 do not enforce scoping yet, so the isolation checks below are reported as EXPECTED-LATER
// and only the baseline checks fail the run. Flip ENFORCING to true once the scoping phase ships.

const ENFORCING = process.env.TENANT_QA_ENFORCING === '1';
const BASE_URL = (process.env.PITCHLINE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ACCOUNTS = ['SITE', 'LFA_A', 'TOUR_B', 'CLUB_A', 'CLUB_AB', 'MGR_A', 'SUPPORTER'];

if (process.env.TENANT_QA_ENABLE !== '1') {
  console.error('Tenant isolation QA is manual. Set TENANT_QA_ENABLE=1 and the credentials described in this file.');
  process.exit(2);
}
if (/vercel\.app|pitchline/i.test(BASE_URL) && process.env.TENANT_QA_ALLOW_REMOTE !== '1') {
  console.error('Refusing to run against a remote host without TENANT_QA_ALLOW_REMOTE=1.');
  process.exit(2);
}
const creds = {};
for (const key of ACCOUNTS) {
  const email = String(process.env[`TENANT_QA_${key}_EMAIL`] || '').trim();
  const password = String(process.env[`TENANT_QA_${key}_PASSWORD`] || '');
  if (!email || !password) { console.error(`Missing TENANT_QA_${key}_EMAIL / TENANT_QA_${key}_PASSWORD`); process.exit(2); }
  creds[key] = { email, password };
}
const COMP_A = String(process.env.TENANT_QA_COMPETITION_A || '').trim();
const COMP_B = String(process.env.TENANT_QA_COMPETITION_B || '').trim();
if (!COMP_A || !COMP_B) { console.error('Set TENANT_QA_COMPETITION_A and TENANT_QA_COMPETITION_B (catalog ids of the seeded league and tournament).'); process.exit(2); }

async function login({ email, password }) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, password }), redirect: 'manual' });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  if (!res.ok || !cookie) throw new Error(`login failed (${res.status})`);
  return cookie;
}
async function get(cookie, path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Accept: 'application/json', Cookie: cookie } });
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}
const rows = body => (Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : Array.isArray(body?.fixtures) ? body.fixtures : []);
const comps = list => new Set(list.map(r => String(r.competitionId || '')).filter(Boolean));

const results = [];
function check(name, ok, enforcedLater = false) {
  const status = ok ? 'PASS' : enforcedLater && !ENFORCING ? 'EXPECTED-LATER' : 'FAIL';
  results.push({ name, status });
  console.log(`${status.padEnd(15)} ${name}`);
}

const cookies = {};
for (const key of ACCOUNTS) cookies[key] = await login(creds[key]);

const fixturesFor = async key => rows((await get(cookies[key], '/api/fixtures')).body);
const sets = {};
for (const key of ACCOUNTS) sets[key] = comps(await fixturesFor(key));

// Baseline (must hold before and after scoping)
check('Site Admin sees competition A', sets.SITE.has(COMP_A));
check('Site Admin sees competition B', sets.SITE.has(COMP_B));
check('Supporter sees A and B', sets.SUPPORTER.has(COMP_A) && sets.SUPPORTER.has(COMP_B));

// Isolation (enforced from the scoping phase)
check('LFA Admin A does not see B', !sets.LFA_A.has(COMP_B), true);
check('Tournament Admin B does not see A', !sets.TOUR_B.has(COMP_A), true);
check('Club in A only does not see B', !sets.CLUB_A.has(COMP_B), true);
check('Club in A and B sees both', sets.CLUB_AB.has(COMP_A) && sets.CLUB_AB.has(COMP_B), true);
check('Manager in A does not see B', !sets.MGR_A.has(COMP_B), true);
// TODO: extend to /api/teams, /api/players, live matches, finance and write routes (cross-competition PUT/POST must be 403).

const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`\n${results.length} checks, ${failed} failed${ENFORCING ? '' : ' (isolation checks are advisory until TENANT_QA_ENFORCING=1)'}`);
process.exit(failed ? 1 : 0);
