import { db } from './appdeployCompat';
import { getSessionUser, type AuthUser } from './auth';

type RecordShape = Record<string, unknown>;

const list = async <T extends RecordShape = RecordShape>(table: string, limit = 5000) => (await db.list<T>(table, { limit })).items;
const asRole = async (userId: string) => {
  const rows = await list('user_roles');
  return String(rows.find(row => String(row.userId) === userId)?.role || 'Supporter');
};
const assertAdmin = async (user: AuthUser | null) => Boolean(user && (await asRole(user.userId)) === 'LFA Admin');
const now = () => Date.now();
const idText = (value: unknown) => String(value || '').trim();

async function recalcStandings() {
  const fixtures = await list('fixtures');
  const teams = await list('teams');
  const calc = new Map<string, RecordShape & { id: string }>();
  for (const team of teams) {
    if (!team.id) continue;
    calc.set(idText(team.name), {
      ...team,
      id: idText(team.id),
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      pts: 0,
    });
  }
  for (const fixture of fixtures) {
    if (String(fixture.status) !== 'completed') continue;
    if (typeof fixture.homeScore !== 'number' || typeof fixture.awayScore !== 'number') continue;
    const home = calc.get(idText(fixture.home));
    const away = calc.get(idText(fixture.away));
    if (!home || !away) continue;
    const hs = Number(fixture.homeScore);
    const as = Number(fixture.awayScore);
    home.played = Number(home.played || 0) + 1;
    away.played = Number(away.played || 0) + 1;
    home.gf = Number(home.gf || 0) + hs;
    home.ga = Number(home.ga || 0) + as;
    away.gf = Number(away.gf || 0) + as;
    away.ga = Number(away.ga || 0) + hs;
    if (hs > as) { home.won = Number(home.won || 0) + 1; home.pts = Number(home.pts || 0) + 3; away.lost = Number(away.lost || 0) + 1; }
    else if (hs < as) { away.won = Number(away.won || 0) + 1; away.pts = Number(away.pts || 0) + 3; home.lost = Number(home.lost || 0) + 1; }
    else { home.drawn = Number(home.drawn || 0) + 1; away.drawn = Number(away.drawn || 0) + 1; home.pts = Number(home.pts || 0) + 1; away.pts = Number(away.pts || 0) + 1; }
  }
  for (const team of calc.values()) {
    await db.update('teams', [{ id: team.id, record: { name: team.name, ageGroup: team.ageGroup, played: team.played, won: team.won, drawn: team.drawn, lost: team.lost, gf: team.gf, ga: team.ga, pts: team.pts } }]);
  }
  return list('teams');
}

export async function startProductionQa(request: { headers: Record<string, string | string[] | undefined> }) {
  const user = getSessionUser(request as any);
  if (!(await assertAdmin(user))) return { status: 403, body: { error: 'LFA Admin role required' } };

  const teams = await list('teams');
  const home = teams.find(team => String(team.name) === 'Liverpool Portland U14') || teams.find(team => /U14/i.test(String(team.name)));
  const away = teams.find(team => String(team.name) === 'Bayhill United U14') || teams.find(team => /U14/i.test(String(team.name)) && String(team.id) !== String(home?.id));
  if (!home || !away) return { status: 409, body: { error: 'QA requires two registered teams.' } };
  const players = await list('players');
  const homePlayers = players.filter(player => String(player.team) === String(home.name));
  const awayPlayers = players.filter(player => String(player.team) === String(away.name));
  if (homePlayers.length < 3 || awayPlayers.length < 1) return { status: 409, body: { error: 'QA requires at least four registered players across the two teams.' } };
  const officials = await list('officials');
  const official = officials.find(item => String(item.availability || '').toLowerCase() === 'available');
  if (!official?.id) return { status: 409, body: { error: 'QA requires an available official.' } };

  const runId = `qa-${now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fixtureRecord = {
    home: String(home.name), away: String(away.name), date: '2099-01-01', time: '01:23', venue: 'Pitchline QA Venue',
    status: 'upcoming', matchdayStatus: 'Planned', homeTeamId: String(home.id), awayTeamId: String(away.id),
    qaRunId: runId, qaFixture: true, createdAt: now(),
  };
  const [fixtureId] = await db.add('fixtures', [fixtureRecord]);
  if (!fixtureId) return { status: 500, body: { error: 'Could not create QA fixture.' } };

  const cleanupTargets = async () => {
    const tables = ['live_event_audit','live_events','performance','discipline','live_match_verifications','live_matches','team_sheets','matchday_readiness','appointments','fixture_change_log','communications'];
    for (const table of tables) {
      const rows = await list(table);
      const ids = rows.filter(row => String(row.fixtureId || '') === String(fixtureId) || (table === 'communications' && String(row.linkedId || '') === String(fixtureId))).map(row => String(row.id || '')).filter(Boolean);
      if (ids.length) await db.delete(table, ids);
    }
    await db.delete('fixtures', [String(fixtureId)]);
  };

  try {
    const [appointmentId] = await db.add('appointments', [{ fixtureId, officialId: String(official.id), role: String(official.role || 'Referee'), status: 'Assigned', qaRunId: runId }]);
    const starters = homePlayers.slice(0, 3).map(player => String(player.memberRef)).filter(Boolean);
    const substitutes = homePlayers.slice(3, 5).map(player => String(player.memberRef)).filter(Boolean);
    const captain = starters[0];
    const [sheetId] = await db.add('team_sheets', [{ fixtureId, formation: '4-3-3', captainRef: captain, starters, substitutes, attendance: [...starters, ...substitutes], qaRunId: runId }]);
    const [readinessId] = await db.add('matchday_readiness', [{ fixtureId, venueReady: true, officialsReady: true, teamSheetReady: true, resultReady: true, notes: 'Automated production QA', updatedAt: now(), qaRunId: runId }]);
    await db.update('fixtures', [{ id: fixtureId, record: { ...fixtureRecord, matchdayStatus: 'Confirmed' } }]);

    const startedAt = now();
    const [liveId] = await db.add('live_matches', [{ fixtureId, status: 'Live', startedAt, elapsedSeconds: 0, homeScore: 0, awayScore: 0, updatedAt: startedAt, qaRunId: runId }]);
    await db.add('live_events', [{ fixtureId, type: 'Kick-off', minute: 1, clockSeconds: 0, createdAt: startedAt, qaRunId: runId }]);

    const homeScorer = starters[0];
    const yellowPlayer = starters[1] || starters[0];
    const subOn = substitutes[0] || starters[2];
    const subOff = starters[2] || starters[1];
    await db.add('live_events', [{ fixtureId, type: 'Goal', minute: 12, clockSeconds: 720, team: String(home.name), player: String(homePlayers.find(p => String(p.memberRef) === homeScorer)?.name || homeScorer), relatedPlayer: homeScorer, createdAt: now(), qaRunId: runId }]);
    await db.add('performance', [{ fixtureId, playerRef: homeScorer, appearance: 'starter', minutes: 12, goals: 1, assists: 0, yellow: 0, red: 0, saves: 0, rating: 0, motm: false, qaRunId: runId }]);
    await db.add('live_events', [{ fixtureId, type: 'Yellow card', minute: 25, clockSeconds: 1500, team: String(home.name), player: String(homePlayers.find(p => String(p.memberRef) === yellowPlayer)?.name || yellowPlayer), relatedPlayer: yellowPlayer, createdAt: now(), qaRunId: runId }]);
    await db.add('performance', [{ fixtureId, playerRef: yellowPlayer, appearance: 'starter', minutes: 25, goals: 0, assists: 0, yellow: 1, red: 0, saves: 0, rating: 0, motm: false, qaRunId: runId }]);
    await db.add('discipline', [{ memberRef: yellowPlayer, fixtureId, type: 'Yellow card', status: 'Open', qaRunId: runId }]);
    await db.add('live_events', [{ fixtureId, type: 'Substitution', minute: 40, clockSeconds: 2400, team: String(home.name), player: String(homePlayers.find(p => String(p.memberRef) === subOn)?.name || subOn), playerOffRef: String(homePlayers.find(p => String(p.memberRef) === subOff)?.name || subOff), playerOnRef: String(homePlayers.find(p => String(p.memberRef) === subOn)?.name || subOn), relatedPlayer: subOn, createdAt: now(), qaRunId: runId }]);
    await db.add('performance', [{ fixtureId, playerRef: subOn, appearance: 'substitute', minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0, saves: 0, rating: 0, motm: false, qaRunId: runId }]);

    const finishedAt = now();
    const liveNext = { fixtureId, status: 'Full time', startedAt: undefined, pausedAt: finishedAt, elapsedSeconds: 1, homeScore: 1, awayScore: 0, updatedAt: finishedAt, id: liveId, qaRunId: runId };
    await db.update('live_matches', [{ id: String(liveId), record: liveNext }]);
    await db.add('live_events', [{ fixtureId, type: 'Full time', minute: 91, clockSeconds: 1, createdAt: finishedAt, qaRunId: runId }]);
    await db.update('fixtures', [{ id: String(fixtureId), record: { ...fixtureRecord, status: 'completed', matchdayStatus: 'Full time', homeScore: 1, awayScore: 0 } }]);
    const standingsAfterFinish = await recalcStandings();
    const [verificationId] = await db.add('live_match_verifications', [{ fixtureId, verifiedAt: now(), verifiedBy: 'Production QA', qaRunId: runId }]);
    const run = { runId, fixtureId, appointmentId, sheetId, readinessId, liveId, verificationId, status: 'verified', score: { home: 1, away: 0 }, events: ['Goal','Yellow card','Substitution'], completedAt: now(), standingsAfterFinish: standingsAfterFinish.filter(team => [String(home.name), String(away.name)].includes(String(team.name))).map(team => ({ name: team.name, played: team.played, won: team.won, drawn: team.drawn, lost: team.lost, gf: team.gf, ga: team.ga, pts: team.pts })) };
    await db.add('production_qa_runs', [{ ...run, createdAt: now() }]);
    return { status: 200, body: run };
  } catch (error) {
    await cleanupTargets();
    await recalcStandings();
    return { status: 500, body: { error: error instanceof Error ? error.message : 'Production QA failed before completion.', cleanedUp: true } };
  }
}

export async function getProductionQaRun(request: { headers: Record<string, string | string[] | undefined> }, runId: string) {
  const user = getSessionUser(request as any);
  if (!(await assertAdmin(user))) return { status: 403, body: { error: 'LFA Admin role required' } };
  const run = (await db.list<RecordShape>('production_qa_runs', { limit: 5000 })).items.find(row => String(row.runId) === runId);
  if (!run) return { status: 404, body: { error: 'QA run not found' } };
  const fixtureId = String(run.fixtureId || '');
  const fixture = (await db.get<RecordShape>('fixtures', [fixtureId]))[0];
  const live = (await list('live_matches')).find(row => String(row.fixtureId) === fixtureId);
  const verification = (await list('live_match_verifications')).find(row => String(row.fixtureId) === fixtureId);
  const events = (await list('live_events')).filter(row => String(row.fixtureId) === fixtureId);
  return { status: 200, body: { ...run, persistence: { fixturePresent: Boolean(fixture), fixtureStatus: fixture?.status, livePresent: Boolean(live), liveStatus: live?.status, verified: Boolean(verification), eventCount: events.length } } };
}

export async function cleanupProductionQaRun(request: { headers: Record<string, string | string[] | undefined> }, runId: string) {
  const user = getSessionUser(request as any);
  if (!(await assertAdmin(user))) return { status: 403, body: { error: 'LFA Admin role required' } };
  const runs = await list('production_qa_runs');
  const run = runs.find(row => String(row.runId) === runId);
  if (!run) return { status: 404, body: { error: 'QA run not found' } };
  const fixtureId = String(run.fixtureId || '');
  const tables = ['live_event_audit','live_events','performance','discipline','live_match_verifications','live_matches','team_sheets','matchday_readiness','appointments','fixture_change_log','communications'];
  for (const table of tables) {
    const rows = await list(table);
    const ids = rows.filter(row => String(row.fixtureId || '') === fixtureId || (table === 'communications' && String(row.linkedId || '') === fixtureId)).map(row => String(row.id || '')).filter(Boolean);
    if (ids.length) await db.delete(table, ids);
  }
  await db.delete('fixtures', [fixtureId]);
  await db.delete('production_qa_runs', [String(run.id)]);
  const standings = await recalcStandings();
  return { status: 200, body: { cleaned: true, fixtureId, runId, standingsRecalculated: true, teams: standings.length } };
}
