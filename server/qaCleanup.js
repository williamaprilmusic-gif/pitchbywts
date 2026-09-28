import { neon } from '@neondatabase/serverless';
import { getSessionUser } from './auth.js';

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
  if (!actor) {
    response.statusCode = 401;
    response.end(JSON.stringify({ error: 'Unauthorized', code: 'not_authenticated' }));
    return true;
  }

  const database = sql();
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

  let removed = 0;
  for (const [namespace, ids] of Object.entries(idsByNamespace)) {
    if (!ids?.length) continue;
    const deleted = await database`DELETE FROM pitchline_records WHERE namespace = ${namespace} AND id = ANY(${ids}) RETURNING id`;
    removed += deleted.length;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ ok: true, removed, fixturesRemoved: fixtureIds.size, namespaces: Object.fromEntries(Object.entries(idsByNamespace).map(([key, ids]) => [key, ids.length])) }));
  return true;
}
