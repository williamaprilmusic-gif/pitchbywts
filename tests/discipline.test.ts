// Run with: npm run test:discipline  (Node 22.18+/24, runs TypeScript directly).
// Pure unit tests for the disciplinary suspension engine. No network, no server, no production data.
// Verifies: red-card bans, yellow-card accumulation, served vs outstanding tracking across the fixture
// order, that a card is never served by its own match, and the league-ledger aggregation + scoping.
import assert from 'node:assert/strict';
import { computePlayerDiscipline, summarizeDiscipline, disciplinePolicyNote, DEFAULT_DISCIPLINE_RULES, type FixtureFull, type CardTally } from '../backend/discipline.ts';

const fx = (id: string, date: string, status = 'completed'): FixtureFull => ({ id, date, status, home: 'Alpha', away: 'Opp' });
const cards = (entries: Array<[string, number, number]>) => new Map<string, CardTally>(entries.map(([id, y, r]) => [id, { yellow: y, red: r }]));

// 1. A red card is a one-match ban; outstanding while the next match is still to be played.
{
  const fixtures = [fx('f1', '2026-01-01'), fx('f2', '2026-01-08', 'upcoming')];
  const d = computePlayerDiscipline('P', fixtures, cards([['f1', 0, 1]]), new Set(['f1']) /* appeared in f1 */);
  assert.equal(d.totalRed, 1);
  assert.equal(d.bansAccrued, 1);
  assert.equal(d.outstanding, 1, 'ban still outstanding before the next match is sat out');
  assert.equal(d.suspended, true);
}

// 2. The red-card ban is served by sitting out the next completed fixture.
{
  const fixtures = [fx('f1', '2026-01-01'), fx('f2', '2026-01-08')];
  const d = computePlayerDiscipline('P', fixtures, cards([['f1', 0, 1]]), new Set(['f1']) /* did NOT appear in f2 */);
  assert.equal(d.matchesServed, 1, 'missing the next completed fixture serves the ban');
  assert.equal(d.outstanding, 0);
  assert.equal(d.suspended, false);
}

// 3. A card is never served by the very match it was shown in.
{
  const fixtures = [fx('f1', '2026-01-01')];
  const d = computePlayerDiscipline('P', fixtures, cards([['f1', 0, 1]]), new Set() /* no appearance record for f1 */);
  assert.equal(d.outstanding, 1, 'the sending-off match does not discharge its own ban');
}

// 4. Yellow-card accumulation: the 5th yellow triggers a one-match ban; the counter resets.
{
  const fixtures = [1, 2, 3, 4, 5].map(n => fx('g' + n, '2026-02-0' + n));
  const byFx = cards([['g1', 1, 0], ['g2', 1, 0], ['g3', 1, 0], ['g4', 1, 0], ['g5', 1, 0]]);
  const d = computePlayerDiscipline('P', fixtures, byFx, new Set(['g1', 'g2', 'g3', 'g4', 'g5']));
  assert.equal(d.totalYellow, 5);
  assert.equal(d.bansAccrued, 1, 'five yellows accumulate into one ban');
  assert.equal(d.yellowToNextBan, DEFAULT_DISCIPLINE_RULES.yellowThreshold, 'yellow counter resets after the ban');
}

// 5. Four yellows: no ban yet, but one yellow away from one.
{
  const fixtures = [1, 2, 3, 4].map(n => fx('h' + n, '2026-03-0' + n));
  const d = computePlayerDiscipline('P', fixtures, cards([['h1', 1, 0], ['h2', 1, 0], ['h3', 1, 0], ['h4', 1, 0]]), new Set(['h1', 'h2', 'h3', 'h4']));
  assert.equal(d.bansAccrued, 0);
  assert.equal(d.outstanding, 0);
  assert.equal(d.yellowToNextBan, 1);
}

// 6. League ledger: only cautioned players appear, suspended first, with name/team/division resolved.
{
  const players = [
    { memberRef: 'M-RED', name: 'Red Carded', team: 'Alpha', ageGroup: 'U14' },
    { memberRef: 'M-CLEAN', name: 'Clean Record', team: 'Alpha', ageGroup: 'U14' },
    { memberRef: 'M-YEL', name: 'One Yellow', team: 'Alpha', ageGroup: 'U14' },
  ];
  const fixtures = [fx('f1', '2026-01-01'), fx('f2', '2026-01-08', 'upcoming')];
  const performance = [
    { playerRef: 'M-RED', fixtureId: 'f1', yellow: 0, red: 1 },
    { playerRef: 'M-CLEAN', fixtureId: 'f1', yellow: 0, red: 0 },
    { playerRef: 'M-YEL', fixtureId: 'f1', yellow: 1, red: 0 },
  ];
  const rows = summarizeDiscipline(players, performance, fixtures);
  assert.deepEqual(rows.map(r => r.playerRef), ['M-RED', 'M-YEL'], 'clean player omitted; suspended player first');
  assert.equal(rows[0].name, 'Red Carded');
  assert.equal(rows[0].team, 'Alpha');
  assert.equal(rows[0].suspended, true);
  assert.equal(rows[1].suspended, false);
}

// 7. Policy note reflects the default rules.
assert.ok(/red card means a 1-match ban/.test(disciplinePolicyNote()) && /5 yellow cards/.test(disciplinePolicyNote()));

console.log('discipline suspension engine tests passed');
