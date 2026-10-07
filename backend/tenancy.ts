// Multi-tenant access model, phase 0. Pure helpers; NOTHING imports this yet and it enforces nothing.
// Intentionally not anchored on by any scripts/prepare-*.mjs. Test: npm run test:tenancy
export type TenantRole = 'Site Admin' | 'LFA Admin' | 'Tournament Admin' | 'Club' | 'Manager' | 'Supporter';
export type Rec = Record<string, unknown>;
export type CompetitionScope = Set<string> | 'all';
export type Access = { role: TenantRole; isSite: boolean; competitionIds: CompetitionScope; clubIds: Set<string> };
export type AccessData = {
  user_roles?: Rec[];
  club_competitions?: Rec[];
  teams?: Rec[];
  competition_catalog?: Rec[];
};
export type Loader = (namespace: string) => Promise<Rec[]>;
export type LookupCtx = { fixtures?: Rec[]; teams?: Rec[]; catalog?: Rec[] };
type Env = Record<string, string | undefined>;

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** Site Admin = signed session email equals PITCHLINE_ADMIN_EMAIL (case-insensitive, trimmed). False when env missing. */
export function isSiteAdmin(email: unknown, env: Env = process.env): boolean {
  const configured = str(env.PITCHLINE_ADMIN_EMAIL).toLowerCase();
  const given = str(email).toLowerCase();
  return Boolean(configured) && Boolean(given) && configured === given;
}

/** Map a legacy leagueId to its competition id through competition_catalog.legacyLeagueId; unmapped ids pass through. */
export function legacyToCompetition(leagueId: unknown, catalog: Rec[] = []): string | undefined {
  const id = str(leagueId);
  if (!id) return undefined;
  const hit = catalog.find(c => str(c.legacyLeagueId) === id);
  return hit ? str(hit.id) || id : id;
}

/** Competition a record belongs to: competitionId, else parent fixture/team, else leagueId (mapped). */
export function competitionOf(record: Rec | null | undefined, ctx: LookupCtx = {}): string | undefined {
  if (!record) return undefined;
  const direct = str(record.competitionId);
  if (direct) return direct;
  const fixtureId = str(record.fixtureId);
  if (fixtureId && ctx.fixtures) {
    const f = ctx.fixtures.find(x => str(x.id) === fixtureId);
    if (f) { const c = competitionOf({ ...f, fixtureId: undefined }, { ...ctx, fixtures: undefined }); if (c) return c; }
  }
  const teamRef = str(record.teamId) || str(record.team);
  if (teamRef && ctx.teams) {
    const t = ctx.teams.find(x => str(x.id) === teamRef || str(x.teamId) === teamRef || str(x.name) === teamRef);
    if (t) { const c = competitionOf({ ...t, teamId: undefined, team: undefined }, { ...ctx, teams: undefined }); if (c) return c; }
  }
  return legacyToCompetition(record.leagueId, ctx.catalog);
}

/** True when the scope is 'all' or the record resolves to a competition inside the set. Unresolvable records are out of scope. */
export function inScope(scope: CompetitionScope, record: Rec | null | undefined, ctx: LookupCtx = {}): boolean {
  if (scope === 'all') return true;
  const c = competitionOf(record, ctx);
  return Boolean(c) && scope.has(c as string);
}

const INACTIVE = new Set(['inactive', 'removed', 'rejected', 'withdrawn', 'pending']);
const linkActive = (r: Rec) => !INACTIVE.has(str(r.status).toLowerCase());

/** Pure resolution against pre-loaded namespaces. */
export function resolveAccessFrom(data: AccessData, userId: string, email: unknown, env: Env = process.env): Access {
  if (isSiteAdmin(email, env)) return { role: 'Site Admin', isSite: true, competitionIds: 'all', clubIds: new Set() };
  const row = (data.user_roles || []).find(r => str(r.userId) === userId);
  const stored = str(row?.role);
  const catalog = data.competition_catalog ?? [];
  // A stored 'Site Admin' on anyone but the bootstrap email (handled above) is only a normal admin: no cross-tenant power.
  if (stored === 'LFA Admin' || stored === 'Tournament Admin' || stored === 'Site Admin') {
    const raw = row?.competitionIds;
    const ids = Array.isArray(raw) ? raw.map(str).filter(Boolean) : [];
    return { role: stored === 'Site Admin' ? 'LFA Admin' : stored, isSite: false, competitionIds: new Set(ids), clubIds: new Set() };
  }
  if (stored === 'Club' || stored === 'Manager') {
    const clubIds = new Set<string>();
    if (str(row?.clubId)) clubIds.add(str(row?.clubId));
    const comps = new Set<string>();
    for (const l of (data.club_competitions || []).filter(linkActive)) {
      if (clubIds.has(str(l.clubId)) && str(l.competitionId)) comps.add(str(l.competitionId));
    }
    for (const t of data.teams || []) {
      const mine = (str(t.clubId) && clubIds.has(str(t.clubId)))
        || (stored === 'Manager' && ((str(row?.teamId) && str(t.id) === str(row?.teamId)) || (str(row?.team) && str(t.name) === str(row?.team))));
      if (!mine) continue;
      if (str(t.clubId)) clubIds.add(str(t.clubId));
      if (comps.size) continue; // explicit club_competitions links take precedence over the teams fallback
      const c = str(t.competitionId) || legacyToCompetition(t.leagueId, catalog);
      if (c) comps.add(c);
    }
    return { role: stored, isSite: false, competitionIds: comps, clubIds };
  }
  return { role: 'Supporter', isSite: false, competitionIds: new Set(), clubIds: new Set() };
}

/** Loads the namespaces it needs through an injected loader (e.g. the app's listTable). */
export async function resolveAccess(userId: string, email: unknown, load: Loader, env: Env = process.env): Promise<Access> {
  if (isSiteAdmin(email, env)) return resolveAccessFrom({}, userId, email, env);
  const [user_roles, club_competitions, teams, competition_catalog] = await Promise.all(
    ['user_roles', 'club_competitions', 'teams', 'competition_catalog'].map(n => load(n).catch(() => [] as Rec[])));
  return resolveAccessFrom({ user_roles, club_competitions, teams, competition_catalog }, userId, email, env);
}
