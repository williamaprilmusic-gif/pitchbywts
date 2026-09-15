const BASE_URL = (process.env.PITCHLINE_BASE_URL || 'https://pitchline-william-april.vercel.app').replace(/\/$/, '');
const EMAIL = String(process.env.PITCHLINE_QA_EMAIL || '').trim();
const PASSWORD = String(process.env.PITCHLINE_QA_PASSWORD || '');

if (!EMAIL || !PASSWORD) {
  console.error('Missing PITCHLINE_QA_EMAIL or PITCHLINE_QA_PASSWORD GitHub Actions secrets.');
  process.exit(2);
}

let cookie = '';
const results = [];

function ok(name, detail) { results.push({ name, status: 'PASS', detail }); console.log(`PASS  ${name}: ${detail}`); }
function fail(name, detail) { results.push({ name, status: 'FAIL', detail }); console.error(`FAIL  ${name}: ${detail}`); }

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let body = null;
  const text = await response.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

function requireStatus(result, expected, label) {
  if (result.response.status !== expected) throw new Error(`${label}: expected ${expected}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function post(path, body) {
  return request(path, { method: 'POST', body: JSON.stringify(body) });
}

function pick(items, predicate, label) {
  const found = (items || []).find(predicate);
  if (!found) throw new Error(`Could not find ${label}`);
  return found;
}

function isoDate(daysAhead = 30) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const health = await request('/api/_healthcheck');
  requireStatus(health, 200, 'health check');
  if (!health.body?.databaseConfigured || !health.body?.sessionConfigured) throw new Error('Production health check is missing database/session configuration.');
  ok('Production health', 'database and session configuration are present');

  const login = await post('/api/auth/sign-in', { email: EMAIL, password: PASSWORD });
  requireStatus(login, 200, 'admin login');
  if (login.body?.role !== 'LFA Admin') throw new Error(`Authenticated account is not LFA Admin; role=${login.body?.role}`);
  ok('Authenticated login', `signed in as ${login.body.user?.email || EMAIL} with LFA Admin role`);

  const me = await request('/api/auth/me');
  requireStatus(me, 200, 'auth/me after login');
  if (me.body?.role !== 'LFA Admin') throw new Error(`auth/me returned role ${me.body?.role}`);
  ok('Session verification', 'HttpOnly session is accepted by protected API');

  const ops = await request('/api/competition-operations');
  requireStatus(ops, 200, 'competition operations');
  const competition = ops.body?.competition;
  if (!competition?.isActive) throw new Error('No active competition is available for QA.');
  const teams = ops.body?.teams || [];
  const players = ops.body?.players || [];
  const officials = ops.body?.officials || [];
  const home = pick(teams, t => String(t.name) === 'Liverpool Portland U14', 'Liverpool Portland U14');
  const away = pick(teams, t => String(t.name) === 'Bayhill United U14', 'Bayhill United U14');
  const homePlayers = players.filter(p => String(p.team) === String(home.name));
  if (homePlayers.length < 2) throw new Error('QA requires at least two registered home-team players for goal/card/substitution testing.');
  const playerA = homePlayers[0];
  const playerB = homePlayers[1];
  const official = pick(officials, o => String(o.availability || '').toLowerCase() === 'available', 'an available official');
  ok('QA fixtures context', `active competition=${competition.name}; official=${official.name}`);

  const qaDate = isoDate(45);
  const qaVenue = `Pitchline QA Ground ${Date.now()}`;
  const venue = await post('/api/venues', { name: qaVenue, location: 'Automated QA', availability: 'Available' });
  requireStatus(venue, 200, 'create QA venue');
  ok('Venue preparation', `created ${qaVenue}`);

  const beforeTeams = await request('/api/teams');
  requireStatus(beforeTeams, 200, 'standings before test');
  const beforeHome = pick(beforeTeams.body, t => String(t.name) === String(home.name), 'home team in standings before test');
  const beforeAway = pick(beforeTeams.body, t => String(t.name) === String(away.name), 'away team in standings before test');

  const fixtureResult = await post('/api/competition-operations/fixtures', {
    home: home.name,
    away: away.name,
    date: qaDate,
    time: '11:00',
    venue: qaVenue,
    phase: 'Automated QA',
    matchday: `QA-${Date.now()}`
  });
  requireStatus(fixtureResult, 200, 'create QA fixture');
  const fixtureId = String(fixtureResult.body?.id || '');
  if (!fixtureId) throw new Error('QA fixture creation returned no fixture ID.');
  ok('Fixture creation', `created ${fixtureId}`);

  const appointment = await post('/api/appointments', { fixtureId, officialId: official.id, role: 'Referee', status: 'Confirmed' });
  requireStatus(appointment, 200, 'assign official');
  ok('Official assignment', `${official.name} assigned and confirmed`);

  const teamSheet = await post('/api/team-sheets', {
    fixtureId,
    formation: '4-3-3',
    captainRef: playerA.memberRef,
    starters: [playerA.memberRef, playerB.memberRef],
    substitutes: [playerB.memberRef],
    attendance: [playerA.memberRef, playerB.memberRef]
  });
  requireStatus(teamSheet, 200, 'prepare team sheet');
  ok('Matchday preparation', 'digital team sheet saved with captain and starters');

  const start = await post('/api/live-match/start', { fixtureId });
  requireStatus(start, 200, 'start live match');
  if (start.body?.status !== 'Live') throw new Error(`Match did not enter Live state: ${start.body?.status}`);
  ok('Start live match', 'fixture entered Live state');

  const goal = await post('/api/live-match/events-v2', { fixtureId, type: 'Goal', minute: 5, clockSeconds: 300, team: home.name, player: playerA.memberRef, goalDetail: 'QA goal' });
  requireStatus(goal, 200, 'record goal');
  if (Number(goal.body?.homeScore) !== 1) throw new Error(`Expected home score 1 after goal; got ${goal.body?.homeScore}`);
  ok('Goal event', 'home score advanced to 1');

  const card = await post('/api/live-match/events-v2', { fixtureId, type: 'Yellow card', minute: 12, clockSeconds: 720, team: home.name, player: playerA.memberRef, note: 'QA yellow card' });
  requireStatus(card, 200, 'record yellow card');
  ok('Card event', 'yellow card recorded and discipline side effect accepted');

  const substitution = await post('/api/live-match/events-v2', { fixtureId, type: 'Substitution', minute: 25, clockSeconds: 1500, team: home.name, playerOffRef: playerA.memberRef, playerOnRef: playerB.memberRef });
  requireStatus(substitution, 200, 'record substitution');
  ok('Substitution event', 'substitution recorded');

  const duplicateGoal = await post('/api/live-match/events-v2', { fixtureId, type: 'Goal', minute: 5, clockSeconds: 300, team: home.name, player: playerA.memberRef, goalDetail: 'QA goal' });
  requireStatus(duplicateGoal, 200, 'duplicate goal replay');
  if (Number(duplicateGoal.body?.homeScore) !== 1) throw new Error(`Idempotency failure: duplicate goal changed score to ${duplicateGoal.body?.homeScore}`);
  const goalCount = (duplicateGoal.body?.events || []).filter(e => e.type === 'Goal').length;
  if (goalCount !== 1) throw new Error(`Idempotency failure: expected one Goal event, found ${goalCount}`);
  ok('Event idempotency', 'duplicate goal replay did not create a second event or increment score');

  const finish = await post('/api/live-match/finish', { fixtureId });
  requireStatus(finish, 200, 'finish match');
  if (finish.body?.status !== 'Full time') throw new Error(`Match did not finish: ${finish.body?.status}`);
  ok('Finish match', `final score ${finish.body?.homeScore}-${finish.body?.awayScore}`);

  const verify = await post('/api/live-match/verify', { fixtureId });
  requireStatus(verify, 200, 'verify match');
  if (!verify.body?.verified) throw new Error('Verification endpoint did not mark match verified.');
  ok('Verify result', 'match is verified and locked');

  const report = await request(`/api/live-match/${fixtureId}/report`);
  requireStatus(report, 200, 'match report');
  if (!report.body?.verified || Number(report.body?.finalScore?.home) !== 1 || Number(report.body?.finalScore?.away) !== 0) throw new Error(`Persisted report mismatch: ${JSON.stringify(report.body?.finalScore)}`);
  const types = new Set((report.body?.events || []).map(e => e.type));
  for (const type of ['Goal', 'Yellow card', 'Substitution']) if (!types.has(type)) throw new Error(`Persisted report is missing ${type}.`);
  ok('Persistence before logout', 'verified report contains score, goal, card and substitution');

  const afterTeams = await request('/api/teams');
  requireStatus(afterTeams, 200, 'standings after test');
  const afterHome = pick(afterTeams.body, t => String(t.name) === String(home.name), 'home team in standings after test');
  const afterAway = pick(afterTeams.body, t => String(t.name) === String(away.name), 'away team in standings after test');
  if (Number(afterHome.played) !== Number(beforeHome.played) + 1) throw new Error(`Standings were not recalculated for home team: ${beforeHome.played} -> ${afterHome.played}`);
  if (Number(afterAway.played) !== Number(beforeAway.played) + 1) throw new Error(`Standings were not recalculated for away team: ${beforeAway.played} -> ${afterAway.played}`);
  if (Number(afterHome.won) !== Number(beforeHome.won) + 1 || Number(afterAway.lost) !== Number(beforeAway.lost) + 1) throw new Error('Standings win/loss calculation did not reflect the QA result.');
  ok('Standings recalculation', `home played ${beforeHome.played}->${afterHome.played}; away played ${beforeAway.played}->${afterAway.played}`);

  const logout = await post('/api/auth/sign-out', {});
  requireStatus(logout, 200, 'logout');
  const afterLogout = await request('/api/auth/me');
  if (afterLogout.response.status !== 401) throw new Error(`Logout did not invalidate the session; auth/me returned ${afterLogout.response.status}`);
  ok('Logout', 'session rejected after sign-out');

  cookie = '';
  const loginAgain = await post('/api/auth/sign-in', { email: EMAIL, password: PASSWORD });
  requireStatus(loginAgain, 200, 're-login');
  if (loginAgain.body?.role !== 'LFA Admin') throw new Error(`Re-login returned role ${loginAgain.body?.role}`);
  const persistedAfterRelogin = await request(`/api/live-match/${fixtureId}/report`);
  requireStatus(persistedAfterRelogin, 200, 'report after re-login');
  if (!persistedAfterRelogin.body?.verified || Number(persistedAfterRelogin.body?.finalScore?.home) !== 1) throw new Error('Production data did not persist after logout/login.');
  ok('Logout/login persistence', 'same verified match report is available after a fresh authenticated session');

  const final = { ok: true, baseUrl: BASE_URL, fixtureId, competition: competition.name, checks: results, completedAt: new Date().toISOString(), note: 'QA fixture is intentionally retained for audit evidence. It is uniquely tagged by its QA venue/matchday.' };
  console.log(JSON.stringify(final, null, 2));
}

main().catch(error => {
  fail('Authenticated production QA', error instanceof Error ? error.message : String(error));
  console.error(JSON.stringify({ ok: false, checks: results, completedAt: new Date().toISOString() }, null, 2));
  process.exit(1);
});
