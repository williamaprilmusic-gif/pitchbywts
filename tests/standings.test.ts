// Run with: npm run test:standings  (Node 22.18+/24, runs TypeScript directly).
// Pure unit tests for the association-standard league ranking engine. No network, no server,
// no production data. Verifies the FIFA / English-league order: points, then goal difference,
// then goals scored, then head-to-head between level teams, then a deterministic name fallback.
import assert from 'node:assert/strict';
import { rankTeams, compareOverall, RANKING_CRITERIA, type StandingTeam, type StandingFixture } from '../src/standings.ts';

const t = (name: string, pts: number, gf: number, ga: number): StandingTeam =>
  ({ name, pts, gf, ga, played: 0, won: 0, drawn: 0, lost: 0 });
const order = (teams: StandingTeam[], fixtures?: StandingFixture[]) => rankTeams(teams, fixtures).map(x => x.name);
const played = (home: string, away: string, hs: number, as: number): StandingFixture =>
  ({ home, away, status: 'completed', homeScore: hs, awayScore: as });

// 1. Points are the primary criterion.
assert.deepEqual(order([t('B', 6, 0, 0), t('A', 9, 0, 0)]), ['A', 'B']);

// 2. Equal points -> goal difference decides.
assert.deepEqual(order([t('Low', 6, 5, 5), t('High', 6, 7, 3)]), ['High', 'Low']);

// 3. Equal points and goal difference -> goals scored decides.
assert.deepEqual(order([t('Few', 6, 3, 3), t('Many', 6, 5, 5)]), ['Many', 'Few']);

// 4. Level on points, GD and GF -> head-to-head result between them decides.
{
  const teams = [t('Alpha', 6, 5, 5), t('Bravo', 6, 5, 5)];
  assert.deepEqual(order(teams, [played('Alpha', 'Bravo', 2, 0)]), ['Alpha', 'Bravo'], 'Alpha won the meeting');
  assert.deepEqual(order(teams, [played('Alpha', 'Bravo', 0, 2)]), ['Bravo', 'Alpha'], 'Bravo won the meeting');
  assert.deepEqual(order(teams, [played('Alpha', 'Bravo', 1, 1)]), ['Alpha', 'Bravo'], 'drawn meeting -> name fallback');
}

// 5. A three-way tie resolves on the head-to-head mini-table (points, then GD, then GF between them).
{
  const teams = [t('Zed', 6, 6, 6), t('Yan', 6, 6, 6), t('Xi', 6, 6, 6)];
  // Mini-league: Xi beats Yan 3-0 and Zed 1-0 (6 pts), Yan beats Zed 2-0 (3 pts), Zed (0 pts).
  const fixtures = [played('Xi', 'Yan', 3, 0), played('Xi', 'Zed', 1, 0), played('Yan', 'Zed', 2, 0)];
  assert.deepEqual(order(teams, fixtures), ['Xi', 'Yan', 'Zed']);
}

// 6. No fixtures / no meeting between tied teams -> deterministic alphabetical fallback.
assert.deepEqual(order([t('Zebra', 6, 5, 5), t('Alpha', 6, 5, 5)]), ['Alpha', 'Zebra']);
assert.deepEqual(order([t('Zebra', 6, 5, 5), t('Alpha', 6, 5, 5)], []), ['Alpha', 'Zebra']);

// 7. Head-to-head never reorders teams that are not level overall (different GD beats any H2H result).
assert.deepEqual(order([t('Strong', 6, 9, 1), t('Weak', 6, 2, 2)], [played('Weak', 'Strong', 5, 0)]), ['Strong', 'Weak']);

// 8. Unplayed / scoreless fixtures are ignored by the head-to-head step.
{
  const teams = [t('One', 6, 5, 5), t('Two', 6, 5, 5)];
  const notPlayed: StandingFixture = { home: 'One', away: 'Two', status: 'upcoming' };
  assert.deepEqual(order(teams, [notPlayed]), ['One', 'Two'], 'upcoming match ignored -> name fallback');
}

// 9. The input array is never mutated.
{
  const teams = [t('B', 3, 0, 0), t('A', 9, 0, 0)];
  const snapshot = teams.map(x => x.name);
  rankTeams(teams, [played('A', 'B', 1, 0)]);
  assert.deepEqual(teams.map(x => x.name), snapshot, 'rankTeams must not mutate its input');
}

// 10. compareOverall is a correct comparator and RANKING_CRITERIA is exported for the UI footnote.
assert.ok(compareOverall(t('X', 9, 0, 0), t('Y', 6, 0, 0)) < 0);
assert.equal(compareOverall(t('X', 6, 4, 2), t('Y', 6, 4, 2)), 0);
assert.ok(typeof RANKING_CRITERIA === 'string' && RANKING_CRITERIA.length > 0);

console.log('standings ranking tests passed');
