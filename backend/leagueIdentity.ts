// Competition-aware identity stamping (multi-tenant phase 1). Pure helpers used by ensureLeagueIdentity,
// GET /api/fixtures and POST /api/league-identity/reconcile in backend/index.ts.
// Rule: only STAMP ids that are missing; never re-parent a record that already has an id.
// Each helper returns the patched record, or null when nothing is missing (so callers skip the write).
// Not anchored on by any scripts/prepare-*.mjs. Test: npm run test:identity
export type Loose = Record<string, unknown>;

const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
const scopeOf = (r: Loose) => String(r.competitionId || r.leagueId || '');

/** Pick a team by name; when several competitions reuse the name, prefer the one in the same competition/league as `scope`. */
export function pickTeamByName<T extends Loose>(teams: T[], name: unknown, scope: Loose = {}): T | undefined {
  const matches = teams.filter(t => t.name === name);
  if (matches.length <= 1) return matches[0];
  const wanted = scopeOf(scope);
  return (wanted && matches.find(t => scopeOf(t) === wanted)) || matches[0];
}

export function stampTeam(team: Loose, defaultLeagueId: string | undefined, clubId: string | undefined): Loose | null {
  const next: Loose = { ...team };
  let changed = false;
  // A team that already belongs to a competition or league keeps its parent; competition-only teams stay competition-only.
  if (!has(team.leagueId) && !has(team.competitionId) && defaultLeagueId) { next.leagueId = defaultLeagueId; changed = true; }
  if (!has(team.clubId) && clubId) { next.clubId = clubId; changed = true; }
  if (!has(team.teamId) && has(team.id)) { next.teamId = team.id; changed = true; }
  return changed ? next : null;
}

export function stampPlayer(player: Loose, team: Loose | undefined, defaultLeagueId: string | undefined): Loose | null {
  if (!team || !has(team.id)) return null;
  const next: Loose = { ...player };
  let changed = false;
  if (!has(player.leagueId) && !has(player.competitionId)) {
    if (has(team.competitionId)) { next.competitionId = team.competitionId; changed = true; }
    else { const league = has(team.leagueId) ? team.leagueId : defaultLeagueId; if (league) { next.leagueId = league; changed = true; } }
  }
  if (!has(player.clubId) && has(team.clubId)) { next.clubId = team.clubId; changed = true; }
  if (!has(player.teamId)) { next.teamId = team.id; changed = true; }
  if (!has(player.playerId) && has(player.memberRef)) { next.playerId = player.memberRef; changed = true; }
  return changed ? next : null;
}

export function stampFixture(fixture: Loose, home: Loose | undefined, away: Loose | undefined, defaultLeagueId: string | undefined): Loose | null {
  const next: Loose = { ...fixture };
  let changed = false;
  if (!has(fixture.leagueId) && !has(fixture.competitionId)) {
    const parent = home || away;
    if (parent && has(parent.competitionId)) { next.competitionId = parent.competitionId; changed = true; }
    else { const league = parent && has(parent.leagueId) ? parent.leagueId : defaultLeagueId; if (league) { next.leagueId = league; changed = true; } }
  }
  if (!has(fixture.homeTeamId) && home && has(home.id)) { next.homeTeamId = home.id; changed = true; }
  if (!has(fixture.awayTeamId) && away && has(away.id)) { next.awayTeamId = away.id; changed = true; }
  return changed ? next : null;
}
