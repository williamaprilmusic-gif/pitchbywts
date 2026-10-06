// Multi-tenant data model, phase 2: safe, idempotent, non-destructive migration to the default competition.
// Dry run by default. Only ever STAMPS missing ids / INSERTS missing link rows; never deletes, renames or overwrites.
// Pure with respect to storage (the db is injected). Not anchored on by any scripts/prepare-*.mjs. Test: npm run test:migration
import type { Rec } from './tenancy';
import { buildClubCompetition, hasClubCompetition, CLUB_COMPETITIONS_NS, slugify } from './competitionModel';

export const LIST_CAP = 5000;
export const STAMP_NAMESPACES = [
  'teams', 'fixtures', 'players', 'officials', 'venues', 'venue_availability', 'registrations', 'payments',
  'invoices', 'communications', 'club_applications', 'announcements', 'training_sessions', 'club_invites',
] as const;
const CONTEXT_NAMESPACES = ['clubs', 'user_roles', 'competition_catalog', 'leagues', CLUB_COMPETITIONS_NS] as const;

export type MigrationDeps = {
  list: (namespace: string, limit: number) => Promise<Rec[]>;
  update: (namespace: string, id: string, record: Rec) => Promise<boolean>;
  add: (namespace: string, records: Rec[]) => Promise<string[]>;
  now: () => number;
};
export type MigrationOptions = { dryRun?: boolean; allowCapped?: boolean; actor?: { userId?: string; email?: string } };
export type TableCounts = { scanned: number; alreadySet: number; wouldStamp: number; stamped: number; unresolved: number };
type Result = { status: number; body: Record<string, unknown> };

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
const UNRESOLVED = Symbol('unresolved');
type Comp = string | typeof UNRESOLVED;

export async function migrateTenancy(deps: MigrationDeps, opts: MigrationOptions = {}): Promise<Result> {
  const dryRun = opts.dryRun !== false;
  const allNamespaces: string[] = [...STAMP_NAMESPACES, ...CONTEXT_NAMESPACES];
  const loadAll = async () => {
    const out: Record<string, Rec[]> = {};
    for (const ns of allNamespaces) out[ns] = await deps.list(ns, LIST_CAP);
    return out;
  };
  const data = await loadAll();
  const capped = allNamespaces.filter(ns => data[ns].length >= LIST_CAP);
  const before: Record<string, number> = Object.fromEntries(allNamespaces.map(ns => [ns, data[ns].length]));

  // ---- (a) default competition: reuse the isActive catalog row, else the row mapped to leagues[0], else create from leagues[0] ----
  const catalog = [...data.competition_catalog];
  const leagues = data.leagues;
  let defaultRow = catalog.find(c => Boolean(c.isActive));
  let defaultAction: 'reused-active' | 'reused-league-mapped' | 'create' = 'reused-active';
  let toCreate: Rec | null = null;
  if (!defaultRow && leagues[0]) {
    defaultRow = catalog.find(c => str(c.legacyLeagueId) && str(c.legacyLeagueId) === str(leagues[0].id));
    defaultAction = 'reused-league-mapped';
    if (!defaultRow) {
      const l = leagues[0];
      const t = deps.now();
      defaultAction = 'create';
      toCreate = {
        name: str(l.name) || 'Default competition', type: 'League', season: str(l.season), country: str(l.country),
        status: ['Active', 'Live'].includes(str(l.status)) ? 'Live' : 'Setup', description: 'Migrated from the league identity registry.',
        legacyLeagueId: str(l.id), createdAt: Number(l.createdAt) || t, updatedAt: t, isActive: true, slug: slugify(`${str(l.name)} ${str(l.season)}`),
      };
    }
  }
  if (!defaultRow && !toCreate) {
    return { status: 409, body: { ok: false, dryRun, error: 'No competition or league exists to use as the default competition. Nothing was changed.' } };
  }
  const PLACEHOLDER = '(new default competition)';
  let defaultId = defaultRow ? str(defaultRow.id) : PLACEHOLDER;
  if (toCreate) catalog.push({ ...toCreate, id: defaultId });

  const leagueToComp = new Map<string, string>();
  for (const c of catalog) if (str(c.legacyLeagueId) && str(c.id) && !leagueToComp.has(str(c.legacyLeagueId))) leagueToComp.set(str(c.legacyLeagueId), str(c.id));

  // ---- resolution: own competitionId, else mapped leagueId, else parent record, else default ----
  // A record whose leagueId has no catalog mapping is left alone (reported as unresolved) rather than guessed into the default.
  const own = (r: Rec): Comp | undefined => {
    if (str(r.competitionId)) return str(r.competitionId);
    if (str(r.leagueId)) return leagueToComp.get(str(r.leagueId)) ?? UNRESOLVED;
    return undefined;
  };
  const clubComp = new Map<string, Comp>();
  for (const c of data.clubs) { const o = own(c); if (o !== undefined && str(c.id)) clubComp.set(str(c.id), o); }
  const teamComp = new Map<string, Comp>();
  const teamsByName = new Map<string, Rec[]>();
  for (const t of data.teams) { const n = str(t.name); if (n) teamsByName.set(n, [...(teamsByName.get(n) || []), t]); }
  const resolveTeam = (t: Rec): Comp => {
    const o = own(t); if (o !== undefined) return o;
    const viaClub = str(t.clubId) ? clubComp.get(str(t.clubId)) : undefined;
    return viaClub ?? defaultId;
  };
  for (const t of data.teams) if (str(t.id)) teamComp.set(str(t.id), resolveTeam(t));
  const teamRef = (r: Rec, idKey: string, nameKey?: string): Comp | undefined => {
    if (str(r[idKey]) && teamComp.has(str(r[idKey]))) return teamComp.get(str(r[idKey]));
    if (nameKey && str(r[nameKey])) { const m = teamsByName.get(str(r[nameKey])); if (m && m.length === 1 && str(m[0].id)) return teamComp.get(str(m[0].id)); }
    return undefined;
  };
  const fixtureComp = new Map<string, Comp>();
  const resolveFixture = (f: Rec): Comp => {
    const o = own(f); if (o !== undefined) return o;
    return teamRef(f, 'homeTeamId', 'home') ?? teamRef(f, 'awayTeamId', 'away') ?? defaultId;
  };
  for (const f of data.fixtures) if (str(f.id)) fixtureComp.set(str(f.id), resolveFixture(f));
  const resolveOther = (r: Rec): Comp => {
    const o = own(r); if (o !== undefined) return o;
    if (str(r.fixtureId) && fixtureComp.has(str(r.fixtureId))) return fixtureComp.get(str(r.fixtureId))!;
    const viaTeam = teamRef(r, 'teamId', 'team'); if (viaTeam !== undefined) return viaTeam;
    if (str(r.clubId) && clubComp.has(str(r.clubId))) return clubComp.get(str(r.clubId))!;
    return defaultId;
  };

  // ---- (b) stamp plan ----
  const tables: Record<string, TableCounts> = {};
  const stampPlan: Array<{ ns: string; id: string; record: Rec; competitionId: string }> = [];
  for (const ns of STAMP_NAMESPACES) {
    const counts: TableCounts = { scanned: 0, alreadySet: 0, wouldStamp: 0, stamped: 0, unresolved: 0 };
    for (const r of data[ns]) {
      counts.scanned++;
      if (str(r.competitionId)) { counts.alreadySet++; continue; }
      const c: Comp = ns === 'teams' ? (teamComp.get(str(r.id)) ?? resolveTeam(r)) : ns === 'fixtures' ? (fixtureComp.get(str(r.id)) ?? resolveFixture(r)) : resolveOther(r);
      if (c === UNRESOLVED || !str(r.id)) { counts.unresolved++; continue; }
      counts.wouldStamp++;
      stampPlan.push({ ns, id: str(r.id), record: r, competitionId: c });
    }
    tables[ns] = counts;
  }

  // ---- (c) club_competitions plan (clubs.leagueId and the competition each club's teams end up in) ----
  const existingLinks = data[CLUB_COMPETITIONS_NS];
  const planned = new Map<string, { clubId: string; competitionId: string }>();
  const consider = (clubId: string, competitionId: Comp | undefined) => {
    if (!clubId || typeof competitionId !== 'string' || !competitionId) return;
    if (hasClubCompetition(existingLinks, clubId, competitionId)) return;
    planned.set(`${clubId}|${competitionId}`, { clubId, competitionId });
  };
  for (const c of data.clubs) consider(str(c.id), clubComp.get(str(c.id)));
  for (const t of data.teams) consider(str(t.clubId), teamComp.get(str(t.id)));
  const linkPlan = [...planned.values()];

  // ---- (d) user_roles plan: existing 'LFA Admin' rows that lack competitionIds ----
  const lfaRows = data.user_roles.filter(r => str(r.role) === 'LFA Admin');
  const rolePlan = lfaRows.filter(r => !Array.isArray(r.competitionIds) && str(r.id));

  const defaultInfo = { id: defaultId, action: defaultAction, name: str(defaultRow?.name ?? toCreate?.name), created: false };
  const linkInfo = { clubsScanned: data.clubs.length, teamsScanned: data.teams.length, existingLinks: existingLinks.length, wouldInsert: linkPlan.length, inserted: 0 };
  const roleInfo = { lfaAdminScanned: lfaRows.length, alreadySet: lfaRows.length - rolePlan.length, wouldSet: rolePlan.length, set: 0 };
  const report: Record<string, unknown> = { ok: true, dryRun, capped, defaultCompetition: defaultInfo, tables, clubCompetitions: linkInfo, userRoles: roleInfo };
  if (capped.length) report.warning = `Namespaces at the ${LIST_CAP}-row listing cap (results may be incomplete): ${capped.join(', ')}`;

  const finish = (after: Record<string, number> | null): Result => {
    const expected: Record<string, number> = { ...before };
    expected.competition_catalog += defaultInfo.created ? 1 : 0;
    expected[CLUB_COMPETITIONS_NS] += linkInfo.inserted;
    const recordCounts: Record<string, { before: number; after: number | null }> = {};
    let loss = false;
    for (const ns of allNamespaces) {
      recordCounts[ns] = { before: before[ns], after: after ? after[ns] : null };
      if (after && after[ns] !== expected[ns]) loss = true;
    }
    report.recordCounts = recordCounts;
    report.lossDetected = loss;
    if (loss) report.ok = false;
    return { status: loss ? 500 : 200, body: report };
  };

  if (dryRun) return finish(null);
  if (capped.length && !opts.allowCapped) {
    report.ok = false;
    report.error = 'A namespace is at the listing cap, so a real run could miss records. Nothing was changed. Resend with allowCapped:true to proceed on the scanned rows only.';
    return { status: 409, body: report };
  }

  // ---- apply: stamp-only writes, no deletes ----
  if (toCreate) {
    const [id] = await deps.add('competition_catalog', [toCreate]);
    if (!id) { report.ok = false; report.error = 'Could not create the default competition. Nothing was stamped.'; return { status: 500, body: report }; }
    defaultId = id;
    defaultInfo.id = id;
    defaultInfo.created = true;
    for (const p of stampPlan) if (p.competitionId === PLACEHOLDER) p.competitionId = id;
    for (const l of linkPlan) if (l.competitionId === PLACEHOLDER) l.competitionId = id;
  }
  for (const p of stampPlan) {
    if (str(p.record.competitionId)) continue; // never overwrite
    if (await deps.update(p.ns, p.id, { ...p.record, competitionId: p.competitionId })) tables[p.ns].stamped++;
  }
  const joinedAt = deps.now();
  for (const l of linkPlan) {
    const [id] = await deps.add(CLUB_COMPETITIONS_NS, [buildClubCompetition(l.clubId, l.competitionId, joinedAt)]);
    if (id) linkInfo.inserted++;
  }
  for (const r of rolePlan) if (await deps.update('user_roles', str(r.id), { ...r, competitionIds: [defaultId] })) roleInfo.set++;

  const afterData = await loadAll();
  const result = finish(Object.fromEntries(allNamespaces.map(ns => [ns, afterData[ns].length])));
  await deps.add('audit_log', [{
    action: 'migrate-tenancy', dryRun: false, actorId: opts.actor?.userId, actorEmail: opts.actor?.email, defaultCompetitionId: defaultId,
    stamped: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.stamped])), clubCompetitionsInserted: linkInfo.inserted, lfaAdminsSet: roleInfo.set,
    lossDetected: report.lossDetected, createdAt: deps.now(),
  }]);
  return result;
}
