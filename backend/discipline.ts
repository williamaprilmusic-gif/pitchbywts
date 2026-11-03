// Association-standard disciplinary suspension engine for Pitchline. Pure and framework-free: the single
// source of truth for turning accumulated cards into match bans and deciding whether each ban is already
// served or still outstanding. A player with an outstanding ban must sit out their team's next match.
//
// Model: cards come from recorded match performance (yellow/red per player per fixture). A red card bans the
// player for `redSuspensionMatches` match(es); every `yellowThreshold` yellows accumulated across the season
// adds one match ban and resets that counter. A ban is "served" when the player's team plays a later COMPLETED
// fixture that the player does not appear in; bans not yet served are "outstanding" (the player is suspended).
// The order of play (fixture date) and the player's appearances decide the served/outstanding split — the same
// deterministic order every surface uses, so a player's status never flickers between recalculations.

export type DisciplineRules = {
  yellowThreshold: number;      // yellows that accumulate into one match ban
  redSuspensionMatches: number; // matches banned per red card
};
export const DEFAULT_DISCIPLINE_RULES: DisciplineRules = { yellowThreshold: 5, redSuspensionMatches: 1 };

export type CardTally = { yellow: number; red: number };
export type FixtureLite = { id: string; date: string; status: string };
export type FixtureFull = FixtureLite & { home: string; away: string };
export type Ban = { reason: string; triggerFixtureId: string; matches: number };
export type PlayerDiscipline = {
  playerRef: string;
  totalYellow: number;
  totalRed: number;
  bansAccrued: number;     // total match-bans ever triggered (served + outstanding)
  matchesServed: number;   // bans discharged by sitting out a completed team fixture
  outstanding: number;     // bans still to serve
  suspended: boolean;      // outstanding > 0 — must sit out the next match
  yellowToNextBan: number; // yellows remaining before the next accumulation ban
  bans: Ban[];
};

const byDate = (a: FixtureLite, b: FixtureLite) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Compute one player's disciplinary standing from their team's fixtures, the cards they picked up, and the fixtures they appeared in. */
export function computePlayerDiscipline(
  playerRef: string,
  teamFixtures: FixtureLite[],
  cardsByFixture: Map<string, CardTally>,
  appeared: Set<string>,
  rules: DisciplineRules = DEFAULT_DISCIPLINE_RULES,
): PlayerDiscipline {
  const sorted = [...teamFixtures].sort(byDate);
  let yellowCount = 0, pending = 0, served = 0, totalYellow = 0, totalRed = 0;
  const bans: Ban[] = [];
  for (const fx of sorted) {
    // A pending ban is served by sitting out a completed team fixture — checked before this fixture's own
    // cards are counted, so a card can never be served by the very match it was shown in.
    if (fx.status === 'completed' && pending > 0 && !appeared.has(fx.id)) { pending--; served++; }
    const c = cardsByFixture.get(fx.id);
    if (!c) continue;
    const y = Math.max(0, Math.floor(Number(c.yellow) || 0));
    const r = Math.max(0, Math.floor(Number(c.red) || 0));
    totalYellow += y; totalRed += r; yellowCount += y;
    while (yellowCount >= rules.yellowThreshold) { yellowCount -= rules.yellowThreshold; pending++; bans.push({ reason: `${rules.yellowThreshold} yellow cards`, triggerFixtureId: fx.id, matches: 1 }); }
    if (r > 0) { const m = rules.redSuspensionMatches * r; pending += m; bans.push({ reason: r > 1 ? `${r} red cards` : 'Red card', triggerFixtureId: fx.id, matches: m }); }
  }
  return { playerRef, totalYellow, totalRed, bansAccrued: served + pending, matchesServed: served, outstanding: pending, suspended: pending > 0, yellowToNextBan: rules.yellowThreshold - yellowCount, bans };
}

export type DisciplinePlayerInput = { memberRef: string; name: string; team: string; ageGroup: string };
export type PerformanceCardInput = { playerRef: string; fixtureId: string; yellow: number; red: number };
export type DisciplineRow = PlayerDiscipline & { name: string; team: string; ageGroup: string };

/**
 * League-wide disciplinary ledger: one row per player who has been cautioned or sent off, each enriched with the
 * player's name/team/division and sorted so suspended players surface first. Players never cautioned are omitted.
 */
export function summarizeDiscipline(
  players: DisciplinePlayerInput[],
  performance: PerformanceCardInput[],
  fixtures: FixtureFull[],
  rules: DisciplineRules = DEFAULT_DISCIPLINE_RULES,
): DisciplineRow[] {
  const cards = new Map<string, Map<string, CardTally>>();   // playerRef -> fixtureId -> tally
  const appeared = new Map<string, Set<string>>();           // playerRef -> set of fixtureIds
  for (const p of performance) {
    const ref = String(p.playerRef || '').trim(); if (!ref) continue;
    const fid = String(p.fixtureId || '').trim(); if (!fid) continue;
    (appeared.get(ref) || appeared.set(ref, new Set()).get(ref)!).add(fid);
    const y = Number(p.yellow) || 0, r = Number(p.red) || 0;
    if (!y && !r) continue;
    const byFx = cards.get(ref) || cards.set(ref, new Map()).get(ref)!;
    const t = byFx.get(fid) || { yellow: 0, red: 0 };
    t.yellow += y; t.red += r; byFx.set(fid, t);
  }
  const fixturesByTeam = new Map<string, FixtureFull[]>();
  for (const f of fixtures) {
    for (const team of [String(f.home || ''), String(f.away || '')]) {
      if (!team) continue;
      (fixturesByTeam.get(team) || fixturesByTeam.set(team, []).get(team)!).push(f);
    }
  }
  const rows: DisciplineRow[] = [];
  for (const player of players) {
    const ref = String(player.memberRef || '').trim(); if (!ref) continue;
    const byFx = cards.get(ref); if (!byFx || !byFx.size) continue;   // only cautioned players appear in the ledger
    const teamFixtures = fixturesByTeam.get(String(player.team || '')) || [];
    const d = computePlayerDiscipline(ref, teamFixtures, byFx, appeared.get(ref) || new Set(), rules);
    rows.push({ ...d, name: player.name || ref, team: player.team || '', ageGroup: player.ageGroup || '' });
  }
  return rows.sort((a, b) =>
    Number(b.suspended) - Number(a.suspended) || b.outstanding - a.outstanding ||
    b.totalRed - a.totalRed || b.totalYellow - a.totalYellow || a.name.localeCompare(b.name));
}

/** One-line description of the suspension policy, for a page footnote or tooltip. */
export const disciplinePolicyNote = (rules: DisciplineRules = DEFAULT_DISCIPLINE_RULES) =>
  `A red card means a ${rules.redSuspensionMatches}-match ban; every ${rules.yellowThreshold} yellow cards add a further one-match ban.`;
