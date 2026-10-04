import { neon } from '@neondatabase/serverless';
import { getSessionUser } from './auth.js';
import { sessionRevoked } from './sessionRevocation.js';

const sql = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
};

const isQaTeam = value => /^QA (Home|Away) \d+ U\d+$/i.test(String(value || '').trim());
const isQaVenue = value => /^Pitchline QA Ground \d+$/i.test(String(value || '').trim());
const isQaCompetition = value => /^Pitchline Automated QA /i.test(String(value || '').trim());

// Records the old demo seeder inserted into empty tables. Each is matched on every
// seeded field, so real records that merely share a name are never removed.
const DEMO_TEAM = 'Liverpool Portland U14';
const demoPlayers = new Map([['LP-001', 'Player 10'], ['LP-002', 'Player 1'], ['LP-003', 'Player 4'], ['LP-004', 'Player 8'], ['LP-005', 'Player 7'], ['LP-006', 'Player 3']]);
const demoRegistrations = new Map([['REG-001', 'New registration 01'], ['REG-002', 'New registration 02']]);
const demoPayments = new Map([['REG-001', ['Registration', 650]], ['REG-002', ['Monthly membership', 350]]]);
const demoOfficials = new Map([['Referee Pool A', 'Referee'], ['Officials Desk', 'Match commissioner']]);
const isDemoPlayer = r => demoPlayers.get(String(r?.memberRef || '')) === String(r?.name || '') && String(r?.team || '') === DEMO_TEAM;
const isDemoRegistration = r => demoRegistrations.get(String(r?.memberRef || '')) === String(r?.name || '');
const isDemoPayment = r => { const seeded = demoPayments.get(String(r?.memberRef || '')); return Boolean(seeded) && String(r?.item || '') === seeded[0] && Number(r?.amount) === seeded[1]; };
const isDemoOfficial = r => demoOfficials.get(String(r?.name || '')) === String(r?.role || '');

export async function cleanupProductionQa(request, response) {
  const actor = getSessionUser(request);
  const database = sql();
  const revoked = actor && await sessionRevoked(actor, async id => (await database`SELECT record FROM pitchline_records WHERE namespace = 'auth_users' AND id = ${id}`)[0]?.record);
  if (!actor || revoked) {
    response.statusCode = 401;
    response.end(JSON.stringify({ error: 'Unauthorized', code: 'not_authenticated' }));
    return true;
  }

  const roles = await database`SELECT record FROM pitchline_records WHERE namespace = 'user_roles'`;
  const admin = roles.some(row => String(row.record?.userId || '') === actor.userId && String(row.record?.role || '') === 'LFA Admin');
  if (!admin) {
    response.statusCode = 403;
    response.end(JSON.stringify({ error: 'LFA Admin role required', code: 'forbidden' }));
    return true;
  }

  const namespaces = ['fixtures','live_matches','live_events','official_appointments','team_sheets','matchday_readiness','matchday_status','venues','teams','players','competitions','registrations','payments','invoices','officials','player_registry'];
  const rowsByNamespace = {};
  for (const namespace of namespaces) {
    rowsByNamespace[namespace] = await database`SELECT id, record FROM pitchline_records WHERE namespace = ${namespace}`;
  }

  const fixtureIds = new Set();
  for (const row of rowsByNamespace.fixtures) {
    const record = row.record || {};
    if (isQaTeam(record.home) && isQaTeam(record.away) && isQaVenue(record.venue)) fixtureIds.add(row.id);
  }

  const idsByNamespace = {};
  const add = (namespace, id) => { (idsByNamespace[namespace] ||= []).push(id); };
  for (const id of fixtureIds) add('fixtures', id);
  for (const namespace of ['live_matches','live_events','official_appointments','team_sheets','matchday_readiness','matchday_status']) {
    for (const row of rowsByNamespace[namespace]) if (fixtureIds.has(String(row.record?.fixtureId || ''))) add(namespace, row.id);
  }
  for (const row of rowsByNamespace.venues) if (isQaVenue(row.record?.name)) add('venues', row.id);
  for (const row of rowsByNamespace.teams) if (isQaTeam(row.record?.name)) add('teams', row.id);
  for (const row of rowsByNamespace.players) {
    const team = String(row.record?.team || '');
    if (isQaTeam(team) || /^QA (Home|Away) Player \d+$/i.test(String(row.record?.name || ''))) add('players', row.id);
  }
  for (const row of rowsByNamespace.competitions) if (isQaCompetition(row.record?.name)) add('competitions', row.id);
  for (const row of rowsByNamespace.players) if (isDemoPlayer(row.record)) add('players', row.id);
  for (const row of rowsByNamespace.player_registry) if (isDemoPlayer(row.record)) add('player_registry', row.id);
  for (const row of rowsByNamespace.registrations) if (isDemoRegistration(row.record)) add('registrations', row.id);
  for (const row of rowsByNamespace.payments) if (isDemoPayment(row.record)) add('payments', row.id);
  for (const row of rowsByNamespace.invoices) if (isDemoPayment(row.record)) add('invoices', row.id);
  for (const row of rowsByNamespace.officials) if (isDemoOfficial(row.record)) add('officials', row.id);

  // Duplicate same-name teams (left by the old demo seeder racing on an empty table).
  // Only teams outside any competition are considered; the copy with the most games
  // played is kept, and a copy is only removed when no other record references its id.
  const teamGroups = new Map();
  for (const row of rowsByNamespace.teams) {
    const record = row.record || {};
    if (record.competitionId) continue;
    const key = `${String(record.name || '').trim().toLowerCase()}|${String(record.ageGroup || '')}`;
    if (!key.startsWith('|')) (teamGroups.get(key) || teamGroups.set(key, []).get(key)).push(row);
  }
  let duplicateTeamsKept = 0;
  const standingsUpdates = [];
  const referenceCount = async (id) => Number((await database`SELECT count(*)::int AS n FROM pitchline_records WHERE NOT (namespace = 'teams' AND id = ${id}) AND record::text LIKE ${'%' + id + '%'}`)[0]?.n || 0);
  for (const rows of teamGroups.values()) {
    if (rows.length < 2) continue;
    const scored = [];
    for (const row of rows) scored.push({ row, refs: await referenceCount(row.id), played: Number(row.record?.played || 0) });
    // Keep the copy other records point at (ties: the one with the most games played).
    scored.sort((a, b) => (b.refs - a.refs) || (b.played - a.played));
    const [keep, ...extras] = scored;
    const freshest = [...scored].sort((a, b) => b.played - a.played)[0];
    let removedAny = false;
    for (const extra of extras) {
      if (extra.refs > 0 || (idsByNamespace.teams || []).includes(extra.row.id)) { duplicateTeamsKept += 1; continue; }
      add('teams', extra.row.id);
      removedAny = true;
    }
    // Carry the most up-to-date standings onto the kept copy so the table does not regress.
    if (removedAny && freshest.row.id !== keep.row.id && (idsByNamespace.teams || []).includes(freshest.row.id)) {
      const stats = {};
      for (const field of ['played', 'won', 'drawn', 'lost', 'gf', 'ga', 'pts']) if (freshest.row.record?.[field] !== undefined) stats[field] = freshest.row.record[field];
      standingsUpdates.push({ id: keep.row.id, record: { ...keep.row.record, ...stats } });
    }
  }
  for (const update of standingsUpdates) {
    await database`UPDATE pitchline_records SET record = ${JSON.stringify(update.record)}::jsonb, updated_at = ${Date.now()} WHERE namespace = 'teams' AND id = ${update.id}`;
  }

  let removed = 0;
  for (const [namespace, ids] of Object.entries(idsByNamespace)) {
    if (!ids?.length) continue;
    const deleted = await database`DELETE FROM pitchline_records WHERE namespace = ${namespace} AND id = ANY(${ids}) RETURNING id`;
    removed += deleted.length;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ ok: true, removed, fixturesRemoved: fixtureIds.size, duplicateTeamsKept, namespaces: Object.fromEntries(Object.entries(idsByNamespace).map(([key, ids]) => [key, ids.length])) }));
  return true;
}
