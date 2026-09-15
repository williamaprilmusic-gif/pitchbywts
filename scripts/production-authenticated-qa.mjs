const BASE_URL = (process.env.PITCHLINE_BASE_URL || 'https://pitchline-william-april.vercel.app').replace(/\/$/, '');
const EMAIL = String(process.env.PITCHLINE_QA_EMAIL || '').trim();
const PASSWORD = String(process.env.PITCHLINE_QA_PASSWORD || '');

if (!EMAIL || !PASSWORD) {
  console.error('Missing PITCHLINE_QA_EMAIL or PITCHLINE_QA_PASSWORD GitHub Actions secrets.');
  process.exit(2);
}

let cookie = '';
const checks = [];
const pass = (name, detail) => { checks.push({ name, status: 'PASS', detail }); console.log(`PASS  ${name}: ${detail}`); };

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function post(path, body) { return request(path, { method: 'POST', body: JSON.stringify(body) }); }
function expect(result, status, label) { if (result.response.status !== status) throw new Error(`${label}: expected HTTP ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`); return result.body; }
function pick(items, predicate, label) { const value = (items || []).find(predicate); if (!value) throw new Error(`Could not find ${label}`); return value; }
function qaDate() { const d = new Date(Date.now() + 45 * 86400000); return d.toISOString().slice(0, 10); }

async function main() {
  const health = await request('/api/_healthcheck');
  const healthBody = expect(health, 200, 'health check');
  if (!healthBody.databaseConfigured || !healthBody.sessionConfigured) throw new Error('Production database/session configuration is incomplete.');
  pass('Production health', 'database and session configuration present');

  const login = await post('/api/auth/sign-in', { email: EMAIL, password: PASSWORD });
  const loginBody = expect(login, 200, 'admin login');
  if (loginBody.role !== 'LFA Admin') throw new Error(`QA account is not LFA Admin: ${loginBody.role}`);
  pass('Authenticated login', 'signed in with LFA Admin role');

  const me = await request('/api/auth/me');
  expect(me, 200, 'auth/me');
  if (me.body.role !== 'LFA Admin') throw new Error('Session role is not LFA Admin.');
  pass('Session verification', 'protected session endpoint accepts authenticated cookie');

  const ops = await request('/api/competition-operations');
  const context = expect(ops, 200, 'competition operations');
  if (!context.competition?.isActive) throw new Error('No active competition is available.');
  const home = pick(context.teams, t => t.name === 'Liverpool Portland U14', 'Liverpool Portland U14');
  const away = pick(context.teams, t => t.name === 'Bayhill United U14', 'Bayhill United U14');
  const homePlayers = context.players.filter(p => p.team === home.name);
  if (homePlayers.length < 4) throw new Error('At least four home players are required for the team-sheet/substitution test.');
  const official = pick(context.officials, o => String(o.availability).toLowerCase() === 'available', 'available official');
  pass('Production context', `active competition ${context.competition.name}; official ${official.name}`);

  const venueName = `Pitchline QA Ground ${Date.now()}`;
  expect(await post('/api/venues', { name: venueName, location: 'Automated production QA', availability: 'Available' }), 200, 'create QA venue');
  pass('Venue preparation', venueName);

  const before = (await request('/api/competition-operations')).body.standings;
  const beforeHome = pick(before, t => t.name === home.name, 'home standings before test');
  const beforeAway = pick(before, t => t.name === away.name, 'away standings before test');

  const fixture = await post('/api/competition-operations/fixtures', { home: home.name, away: away.name, date: qaDate(), time: '23:45', venue: venueName, phase: 'Automated QA', matchday: `QA-${Date.now()}` });
  const fixtureBody = expect(fixture, 200, 'create QA fixture');
  const fixtureId = String(fixtureBody.id || '');
  if (!fixtureId) throw new Error('Fixture creation returned no ID.');
  pass('Fixture creation', fixtureId);

  const appointment = await post('/api/official-appointments', { fixtureId, officialId: official.id, role: 'Referee' });
  const appointmentBody = expect(appointment, 200, 'assign official');
  const confirmation = await request(`/api/official-appointments/${appointmentBody.id}`, { method: 'PUT', body: JSON.stringify({ status: 'Confirmed' }) });
  expect(confirmation, 200, 'confirm official');
  pass('Official assignment', `${official.name} assigned and confirmed`);

  expect(await post('/api/team-sheets', { fixtureId, formation: '4-3-3', captainRef: homePlayers[0].memberRef, starters: homePlayers.slice(0, 4).map(p => p.memberRef), substitutes: homePlayers.slice(2, 4).map(p => p.memberRef), attendance: homePlayers.slice(0, 4).map(p => p.memberRef) }), 200, 'save team sheet');
  expect(await post('/api/matchday-readiness', { fixtureId, venueReady: true, officialsReady: true, teamSheetReady: true, resultReady: false, notes: 'Automated production QA' }), 200, 'save matchday readiness');
  expect(await post('/api/matchday/status', { fixtureId, status: 'Confirmed' }), 200, 'confirm matchday');
  pass('Matchday preparation', 'team sheet, readiness and matchday confirmation saved');

  const start = await post('/api/live-match/start', { fixtureId });
  const liveStart = expect(start, 200, 'start live match');
  if (liveStart.status !== 'Live') throw new Error(`Expected Live state, got ${liveStart.status}`);
  pass('Start live match', 'Live state entered and persisted');

  const goal = await post('/api/live-match/events-v2', { fixtureId, type: 'Goal', team: home.name, player: homePlayers[0].memberRef, minute: 5, clockSeconds: 300, goalDetail: 'QA goal' });
  const goalBody = expect(goal, 200, 'record goal');
  if (goalBody.homeScore !== 1 || goalBody.awayScore !== 0) throw new Error('Goal did not produce 1-0.');
  pass('Goal event', 'score changed to 1-0');

  expect(await post('/api/live-match/events-v2', { fixtureId, type: 'Yellow card', team: home.name, player: homePlayers[0].memberRef, minute: 12, clockSeconds: 720, note: 'QA yellow' }), 200, 'record yellow card');
  pass('Card event', 'yellow card recorded');

  expect(await post('/api/live-match/events-v2', { fixtureId, type: 'Substitution', team: home.name, playerOffRef: homePlayers[2].memberRef, playerOnRef: homePlayers[3].memberRef, minute: 25, clockSeconds: 1500 }), 200, 'record substitution');
  pass('Substitution event', 'substitution recorded');

  const duplicate = await post('/api/live-match/events-v2', { fixtureId, type: 'Goal', team: home.name, player: homePlayers[0].memberRef, minute: 5, clockSeconds: 300, goalDetail: 'QA goal' });
  const duplicateBody = expect(duplicate, 200, 'replay duplicate goal');
  if (duplicateBody.homeScore !== 1 || (duplicateBody.events || []).filter(e => e.type === 'Goal').length !== 1) throw new Error('Live-event idempotency failed.');
  pass('Event idempotency', 'duplicate goal replay was safely absorbed');

  const finish = await post('/api/live-match/finish', { fixtureId });
  const finishBody = expect(finish, 200, 'finish match');
  if (finishBody.status !== 'Full time') throw new Error(`Expected Full time, got ${finishBody.status}`);
  pass('Finish match', 'Full time recorded');

  const verify = await post('/api/live-match/verify', { fixtureId });
  const verifyBody = expect(verify, 200, 'verify match');
  if (!verifyBody.verified) throw new Error('Match verification did not return verified=true.');
  pass('Verify result', 'verified match is locked');

  const report = await request(`/api/live-match/${fixtureId}/report`);
  const reportBody = expect(report, 200, 'match report');
  const eventTypes = new Set((reportBody.events || []).map(e => e.type));
  for (const type of ['Goal', 'Yellow card', 'Substitution', 'Full time']) if (!eventTypes.has(type)) throw new Error(`Report missing ${type}.`);
  if (!reportBody.verified || reportBody.finalScore.home !== 1 || reportBody.finalScore.away !== 0) throw new Error('Persisted match report is inconsistent.');
  pass('Result persistence', 'report contains final score, events and verification');

  const after = (await request('/api/competition-operations')).body.standings;
  const afterHome = pick(after, t => t.name === home.name, 'home standings after test');
  const afterAway = pick(after, t => t.name === away.name, 'away standings after test');
  if (Number(afterHome.played) !== Number(beforeHome.played) + 1 || Number(afterHome.won) !== Number(beforeHome.won) + 1 || Number(afterHome.points) !== Number(beforeHome.points) + 3) throw new Error('Home standings did not recalculate.');
  if (Number(afterAway.played) !== Number(beforeAway.played) + 1 || Number(afterAway.lost) !== Number(beforeAway.lost)) throw new Error('Away standings did not recalculate.');
  pass('Standings recalculation', 'completed result updated league table');

  expect(await post('/api/auth/sign-out', {}), 200, 'logout');
  const afterLogout = await request('/api/auth/me');
  if (afterLogout.response.status !== 401) throw new Error(`Session remained valid after logout: HTTP ${afterLogout.response.status}`);
  pass('Logout', 'protected session rejected after sign-out');

  cookie = '';
  const relogin = await post('/api/auth/sign-in', { email: EMAIL, password: PASSWORD });
  const reloginBody = expect(relogin, 200, 're-login');
  if (reloginBody.role !== 'LFA Admin') throw new Error('Re-login did not restore LFA Admin role.');
  const persisted = await request(`/api/live-match/${fixtureId}/report`);
  const persistedBody = expect(persisted, 200, 'report after re-login');
  if (!persistedBody.verified || persistedBody.finalScore.home !== 1 || (persistedBody.events || []).length < 4) throw new Error('Production data did not persist after logout/login.');
  pass('Logout/login persistence', 'verified match remains available after fresh session');

  console.log(JSON.stringify({ ok: true, fixtureId, checks, completedAt: new Date().toISOString(), note: 'QA fixture and venue are intentionally retained as production audit evidence. Each run creates a unique QA fixture.' }, null, 2));
}

main().catch(error => {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  console.error(JSON.stringify({ ok: false, checks, completedAt: new Date().toISOString() }, null, 2));
  process.exit(1);
});
