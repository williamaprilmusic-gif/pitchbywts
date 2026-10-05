// Run with: npm run test:fixtures  (Node 22+/24 strips types natively)
import assert from 'node:assert/strict';
import { roundRobin, scheduleMatchdays, splitGroups, buildBracket, knockoutPairs, groupKnockoutPairs, findDuplicates, canGenerateFixtures, isValidIsoDate } from '../backend/fixtureGenerator.ts';

const names = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

for (const legs of [1, 2] as const) {
  for (let n = 2; n <= 20; n++) {
    const teams = names(n);
    const rounds = roundRobin(teams, legs);
    const perLeg = n % 2 ? n : n - 1;
    assert.equal(rounds.length, perLeg * legs, `rounds n=${n} legs=${legs}`);
    const all = rounds.flatMap(r => r.matches);
    assert.equal(all.length, (n * (n - 1) / 2) * legs, `fixture count n=${n} legs=${legs}`);
    const seen = new Set(all.map(m => `${m.home}|${m.away}`));
    assert.equal(seen.size, all.length, `no repeated ordered pairing n=${n}`);
    const pairCount = new Map<string, number>();
    for (const m of all) { const k = [m.home, m.away].sort().join('|'); pairCount.set(k, (pairCount.get(k) || 0) + 1); }
    assert.equal(pairCount.size, n * (n - 1) / 2);
    for (const c of pairCount.values()) assert.equal(c, legs, `each pair exactly ${legs}x`);
    const home = new Map<string, number>(); const away = new Map<string, number>(); const byes = new Map<string, number>();
    for (const r of rounds) {
      const playing = new Set<string>();
      for (const m of r.matches) { assert.ok(!playing.has(m.home) && !playing.has(m.away), `team twice in round n=${n}`); playing.add(m.home); playing.add(m.away); assert.notEqual(m.home, m.away); home.set(m.home, (home.get(m.home) || 0) + 1); away.set(m.away, (away.get(m.away) || 0) + 1); }
      if (n % 2) { assert.ok(r.bye, 'bye expected for odd n'); assert.ok(!playing.has(r.bye!)); assert.equal(playing.size, n - 1); byes.set(r.bye!, (byes.get(r.bye!) || 0) + 1); }
      else { assert.equal(r.bye, undefined); assert.equal(playing.size, n); }
    }
    if (n % 2) { assert.equal(byes.size, n); for (const c of byes.values()) assert.equal(c, legs, 'one bye per team per leg'); }
    for (const t of teams) {
      const diff = Math.abs((home.get(t) || 0) - (away.get(t) || 0));
      assert.ok(diff <= (legs === 2 ? 0 : 1) + (legs === 1 && n % 2 === 0 ? 0 : 0), `home/away balance n=${n} legs=${legs} team=${t} diff=${diff}`);
    }
  }
}

// scheduling: one date per matchday, weekday respected, no venue double booking, team clash avoided, blocks respected
{
  const rounds = roundRobin(names(6), 2);
  const opts = { startDate: '2026-10-07', weekday: 6, times: ['10:00', '12:00'], venues: ['A', 'B'] };
  const existing = [{ home: 'X', away: 'T1', date: '2026-10-10', time: '10:00', venue: 'A' }];
  const blocked = [{ venue: 'A', date: '2026-10-17', time: '10:00' }];
  const { fixtures } = scheduleMatchdays(rounds.map(r => r.matches), opts, { existing, blocked });
  assert.equal(fixtures.length, 30);
  assert.ok(fixtures.every(f => new Date(`${f.date}T00:00:00Z`).getUTCDay() === 6), 'weekday');
  const keys = new Set(fixtures.map(f => `${f.date}|${f.time}|${f.venue}`)); assert.equal(keys.size, 30, 'no venue double booking');
  assert.ok(!keys.has('2026-10-10|10:00|A') && !keys.has('2026-10-17|10:00|A'));
  assert.ok(!fixtures.some(f => f.date === '2026-10-10'), 'T1 busy on 10-10 pushes matchday 1 out');
  const perDay = new Map<string, string[]>(); for (const f of fixtures) perDay.set(f.date, [...(perDay.get(f.date) || []), f.home, f.away]);
  for (const list of perDay.values()) assert.equal(new Set(list).size, list.length, 'team once per date');
  assert.throws(() => scheduleMatchdays([roundRobin(names(6))[0].matches], { ...opts, venues: ['A'], times: ['10:00'] }, { existing: [], blocked: [] }), /only 1 time\/venue/);
}

// groups
{ const g = splitGroups(names(8), 2); assert.deepEqual(g.map(x => x.length), [4, 4]); assert.equal(new Set(g.flat()).size, 8); }

// knockout bracket
{
  const b8 = buildBracket(knockoutPairs(names(8)));
  assert.equal(b8.length, 7); assert.equal(b8.filter(m => m.round === 1 && m.real).length, 4);
  assert.ok(b8.some(m => m.home === 'Winner QF1' && m.away === 'Winner QF2' && m.id === 'SF1'));
  assert.deepEqual(b8.at(-1)!.home, 'Winner SF1');
  const b6 = buildBracket(knockoutPairs(names(6)));
  assert.equal(b6.filter(m => m.bye).length, 2, '6 teams -> 2 byes'); assert.equal(b6.filter(m => m.round === 1 && m.real).length, 2);
  const semi = b6.filter(m => m.round === 2); assert.ok(semi.some(m => m.home === 'T1' || m.away === 'T1'), 'seed 1 bye advances');
  const gk = buildBracket(groupKnockoutPairs(['Group A', 'Group B', 'Group C', 'Group D'], 2));
  assert.equal(gk.length, 7); assert.equal(gk[0].home, 'Group A winner'); assert.equal(gk[0].away, 'Group B runner-up'); assert.ok(gk.every(m => !m.real));
  assert.throws(() => groupKnockoutPairs(['A', 'B', 'C'], 2)); assert.throws(() => groupKnockoutPairs(['A', 'B', 'C'], 1));
}

// duplicates + helpers
assert.deepEqual(findDuplicates([{ home: 'A', away: 'B' }, { home: 'B', away: 'C' }], [{ home: 'B', away: 'A' }], true), [true, false]);
assert.deepEqual(findDuplicates([{ home: 'A', away: 'B' }], [{ home: 'B', away: 'A' }], false), [false]);
assert.equal(canGenerateFixtures('LFA Admin'), true);
for (const r of ['Club', 'Manager', 'Supporter', '', undefined]) assert.equal(canGenerateFixtures(r as string), false);
assert.ok(isValidIsoDate('2026-02-28') && !isValidIsoDate('2026-02-30') && !isValidIsoDate('26-1-1'));
console.log('fixtureGenerator: all assertions passed');
