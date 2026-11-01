// Association-standard league ranking for Pitchline.
//
// The base order — points, then goal difference, then goals scored — is the order used by
// both FIFA competition regulations (group-stage ranking criteria) and the English league
// model (Premier League / EFL handbooks: goal difference, then goals scored). When teams are
// still level on all three, FIFA's regulations break the tie with a head-to-head "mini-table"
// built only from the matches played between the tied teams, in the same order (points, then
// goal difference, then goals scored). A final alphabetical fallback keeps the table fully
// deterministic so positions never flicker between recalculations.
//
// References: FIFA competition regulations (ranking of teams in a group); Premier League
// handbook ranking rules. Keep this module pure and framework-free: it is the single source
// of ranking truth for every surface that shows a table (league table, public portal, reports).

export type StandingTeam = {
  name: string;
  played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; pts: number;
};
export type StandingFixture = {
  home: string; away: string; status: string;
  homeScore?: number; awayScore?: number;
};

const gd = (t: StandingTeam) => t.gf - t.ga;

/** Overall criteria shared by FIFA and the English league model: points, goal difference, goals scored. */
export function compareOverall(a: StandingTeam, b: StandingTeam): number {
  return b.pts - a.pts || gd(b) - gd(a) || b.gf - a.gf;
}

/** A fixture counts toward the table only once it is completed with two numeric scores. */
function isPlayed(f: StandingFixture): boolean {
  return f.status === 'completed' && typeof f.homeScore === 'number' && typeof f.awayScore === 'number';
}

/** Head-to-head mini-table among a set of tied team names, from the matches between them only. */
function headToHead(names: string[], fixtures: StandingFixture[]): Map<string, { pts: number; gd: number; gf: number }> {
  const set = new Set(names);
  const table = new Map<string, { pts: number; gd: number; gf: number }>();
  for (const n of names) table.set(n, { pts: 0, gd: 0, gf: 0 });
  for (const f of fixtures) {
    if (!isPlayed(f) || !set.has(f.home) || !set.has(f.away)) continue;
    const hs = f.homeScore as number, as = f.awayScore as number;
    const h = table.get(f.home)!, a = table.get(f.away)!;
    h.gf += hs; a.gf += as; h.gd += hs - as; a.gd += as - hs;
    if (hs > as) h.pts += 3; else if (hs < as) a.pts += 3; else { h.pts += 1; a.pts += 1; }
  }
  return table;
}

/**
 * Rank teams by the association-standard order, returning a new sorted array (input untouched).
 * Pass completed fixtures to enable FIFA-style head-to-head tie-breaking among teams that are
 * level on points, goal difference and goals scored; omit them to fall straight through to the
 * deterministic alphabetical fallback. Teams from different divisions never share a match, so
 * they resolve on the fallback and are never wrongly reordered by head-to-head.
 */
export function rankTeams<T extends StandingTeam>(teams: T[], fixtures: StandingFixture[] = []): T[] {
  const base = [...teams].sort((a, b) => compareOverall(a, b) || a.name.localeCompare(b.name));
  if (!fixtures.length) return base;
  const out: T[] = [];
  for (let i = 0; i < base.length; ) {
    let j = i + 1;
    while (j < base.length && compareOverall(base[i], base[j]) === 0) j++;
    const group = base.slice(i, j);
    if (group.length > 1) {
      const h2h = headToHead(group.map(t => t.name), fixtures);
      group.sort((a, b) => {
        const x = h2h.get(a.name)!, y = h2h.get(b.name)!;
        return y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || a.name.localeCompare(b.name);
      });
    }
    out.push(...group);
    i = j;
  }
  return out;
}

/** One-line description of the ranking order, for a table footnote or tooltip. */
export const RANKING_CRITERIA =
  'Ranked by points, then goal difference, then goals scored, then head-to-head record between level teams.';
