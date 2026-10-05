// Pure fixture-generation logic (no I/O). Used by the LFA Admin fixture generator routes.

/** Single place that decides who may generate fixtures. Widen here when roles change. */
export function canGenerateFixtures(role: string | null | undefined): boolean {
  return role === 'LFA Admin';
}

export type Match = { home: string; away: string; stage?: string };
export type RRRound = { round: number; matches: Match[]; bye?: string };
export type Slotted = { home: string; away: string; date: string; time: string; venue: string };
export type ScheduledFixture = Match & { date: string; time: string; venue: string; matchday: number };
export type ScheduleOptions = { startDate: string; weekday: number; times: string[]; venues: string[] };
export type ScheduleContext = { existing: Slotted[]; blocked: Array<{ venue: string; date: string; time: string }> };

/**
 * Orients every pairing (who is home) so each team's home and away counts differ by at most one.
 * Walks an Euler circuit of the complete graph (a dummy vertex is added when the team count is even).
 */
function homeAssignments(n: number): Map<string, number> {
  const m = n % 2 ? n : n + 1;
  const adj: Array<Set<number>> = Array.from({ length: m }, (_, i) => new Set(Array.from({ length: m }, (_, j) => j).filter(j => j !== i)));
  const stack = [0]; const circuit: number[] = [];
  while (stack.length) { const v = stack[stack.length - 1]; const it = adj[v].values().next(); if (it.done) { circuit.push(stack.pop()!); } else { const w = it.value; adj[v].delete(w); adj[w].delete(v); stack.push(w); } }
  const home = new Map<string, number>();
  for (let k = 0; k + 1 < circuit.length; k++) { const u = circuit[k]; const v = circuit[k + 1]; if (u < n && v < n) home.set(`${Math.min(u, v)}|${Math.max(u, v)}`, u); }
  return home;
}

/** Circle-method round robin. Odd team counts get a bye each round. Leg 2 mirrors leg 1 with home/away swapped. */
export function roundRobin(teams: string[], legs: 1 | 2 = 1): RRRound[] {
  const list: Array<string | null> = teams.slice();
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const homeOf = homeAssignments(teams.length);
  const idx = new Map(teams.map((t, i) => [t, i] as const));
  const leg1: RRRound[] = [];
  let arr = list.slice();
  for (let r = 0; r < n - 1; r++) {
    const matches: Match[] = [];
    let bye: string | undefined;
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null || b === null) { bye = (a ?? b) as string; continue; }
      const ia = idx.get(a)!; const ib = idx.get(b)!;
      matches.push(homeOf.get(`${Math.min(ia, ib)}|${Math.max(ia, ib)}`) === ia ? { home: a, away: b } : { home: b, away: a });
    }
    leg1.push({ round: r + 1, matches, bye });
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  if (legs === 1) return leg1;
  const leg2 = leg1.map((x, k) => ({ round: leg1.length + k + 1, bye: x.bye, matches: x.matches.map(m => ({ home: m.away, away: m.home })) }));
  return [...leg1, ...leg2];
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isValidTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const firstWeekdayOnOrAfter = (iso: string, weekday: number) => { const d = new Date(`${iso}T00:00:00Z`); return addDays(iso, (weekday - d.getUTCDay() + 7) % 7); };

/**
 * Places each matchday on one date (the chosen weekday), one match per free time/venue slot.
 * A matchday moves to the following week when a slot is already booked or blocked, or a team already plays that day.
 */
export function scheduleMatchdays(matchdays: Match[][], opts: ScheduleOptions, ctx: ScheduleContext, notBefore?: string): { fixtures: ScheduledFixture[]; lastDate: string } {
  const slotsPerDay = opts.times.length * opts.venues.length;
  const used = new Set(ctx.existing.map(f => `${f.date}|${f.time}|${f.venue}`));
  const blocked = new Set(ctx.blocked.map(f => `${f.date}|${f.time}|${f.venue}`));
  const busy = new Set<string>();
  for (const f of ctx.existing) { busy.add(`${f.date}|${f.home}`); busy.add(`${f.date}|${f.away}`); }
  const out: ScheduledFixture[] = [];
  let cursor = firstWeekdayOnOrAfter(notBefore && notBefore > opts.startDate ? notBefore : opts.startDate, opts.weekday);
  let lastDate = cursor;
  matchdays.forEach((matches, idx) => {
    if (matches.length > slotsPerDay) throw new Error(`Matchday ${idx + 1} has ${matches.length} matches but only ${slotsPerDay} time/venue slots are available. Add venues or kick-off times.`);
    let placed: ScheduledFixture[] | null = null;
    for (let attempt = 0; attempt < 60 && !placed; attempt++) {
      const date = addDays(cursor, attempt * 7);
      if (matches.some(m => busy.has(`${date}|${m.home}`) || busy.has(`${date}|${m.away}`))) continue;
      const taken = new Set<string>();
      const day: ScheduledFixture[] = [];
      for (const m of matches) {
        let slot: { time: string; venue: string } | null = null;
        for (const time of opts.times) { for (const venue of opts.venues) { const key = `${date}|${time}|${venue}`; if (!used.has(key) && !blocked.has(key) && !taken.has(key)) { slot = { time, venue }; break; } } if (slot) break; }
        if (!slot) break;
        taken.add(`${date}|${slot.time}|${slot.venue}`);
        day.push({ ...m, date, time: slot.time, venue: slot.venue, matchday: idx + 1 });
      }
      if (day.length === matches.length) placed = day;
    }
    if (!placed) throw new Error(`Could not find free venue slots for matchday ${idx + 1} within 60 weeks.`);
    for (const f of placed) { used.add(`${f.date}|${f.time}|${f.venue}`); busy.add(`${f.date}|${f.home}`); busy.add(`${f.date}|${f.away}`); out.push(f); }
    if (placed.length) { lastDate = placed[0].date; cursor = addDays(lastDate, 7); }
  });
  return { fixtures: out, lastDate };
}

/** Splits seeded teams across groups using snake order. */
export function splitGroups(teams: string[], groupCount: number): string[][] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  teams.forEach((t, i) => { const row = Math.floor(i / groupCount); const col = i % groupCount; groups[row % 2 === 0 ? col : groupCount - 1 - col].push(t); });
  return groups;
}

export type Entrant = { label: string; team?: string };
export type BracketMatch = { id: string; round: number; roundName: string; home: string; away: string; bye?: boolean; real: boolean };
const isPow2 = (n: number) => n >= 2 && (n & (n - 1)) === 0;
const roundName = (size: number, round: number) => { const left = size / 2 ** (round - 1); return left === 2 ? 'Final' : left === 4 ? 'Semi-final' : left === 8 ? 'Quarter-final' : `Round of ${left}`; };
const idPrefix = (size: number, round: number) => { const left = size / 2 ** (round - 1); return left === 2 ? 'F' : left === 4 ? 'SF' : left === 8 ? 'QF' : `R${left}-`; };

/** Standard seeded order so that seed 1 and 2 can only meet in the final. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) { const s = order.length * 2; order = order.flatMap(x => [x, s + 1 - x]); }
  return order;
}

/** Builds the whole bracket from first-round pairs. A null opponent is a bye. Later rounds hold placeholders such as "Winner QF1". */
export function buildBracket(pairs: Array<[Entrant, Entrant | null]>): BracketMatch[] {
  const size = pairs.length * 2;
  if (!isPow2(size)) throw new Error('Knockout bracket size must be a power of two.');
  const rounds = Math.log2(size);
  const out: BracketMatch[] = [];
  // label shown for the participant coming out of each match of the previous round
  let carry: string[] = [];
  pairs.forEach(([a, b], m) => {
    const id = `${idPrefix(size, 1)}${size === 2 ? '' : m + 1}`;
    out.push({ id, round: 1, roundName: roundName(size, 1), home: a.team || a.label, away: b ? b.team || b.label : 'BYE', bye: !b, real: !!(b && a.team && b.team) });
    carry.push(b ? `Winner ${id}` : a.team || a.label);
  });
  for (let r = 2; r <= rounds; r++) {
    const next: string[] = [];
    for (let m = 0; m < carry.length / 2; m++) {
      const id = `${idPrefix(size, r)}${r === rounds ? '' : m + 1}`;
      out.push({ id, round: r, roundName: roundName(size, r), home: carry[m * 2], away: carry[m * 2 + 1], real: false });
      next.push(`Winner ${id}`);
    }
    carry = next;
  }
  return out;
}

/** Pairs for a straight knockout of the given seeded teams; missing seeds become byes for the top seeds. */
export function knockoutPairs(teams: string[]): Array<[Entrant, Entrant | null]> {
  let size = 2; while (size < teams.length) size *= 2;
  const order = seedOrder(size);
  const pairs: Array<[Entrant, Entrant | null]> = [];
  for (let i = 0; i < size; i += 2) {
    const a = teams[order[i] - 1]; const b = teams[order[i + 1] - 1];
    pairs.push([{ label: `Seed ${order[i]}`, team: a }, b ? { label: `Seed ${order[i + 1]}`, team: b } : null]);
  }
  return pairs;
}

/** Pairs for the knockout that follows a group stage. Group winners and runners-up are placeholders. */
export function groupKnockoutPairs(groupNames: string[], qualifiers: 1 | 2): Array<[Entrant, Entrant | null]> {
  const total = groupNames.length * qualifiers;
  if (!isPow2(total)) throw new Error('Groups x qualifiers per group must be 2, 4, 8, 16 or 32 so the knockout bracket is complete.');
  const pairs: Array<[Entrant, Entrant | null]> = [];
  if (qualifiers === 1) { for (let i = 0; i < groupNames.length; i += 2) pairs.push([{ label: `${groupNames[i]} winner` }, { label: `${groupNames[i + 1]} winner` }]); return pairs; }
  if (groupNames.length % 2) throw new Error('Two qualifiers per group needs an even number of groups.');
  for (let i = 0; i < groupNames.length; i += 2) {
    const A = groupNames[i]; const B = groupNames[i + 1];
    pairs.push([{ label: `${A} winner` }, { label: `${B} runner-up` }], [{ label: `${B} winner` }, { label: `${A} runner-up` }]);
  }
  return pairs;
}

export const groupName = (i: number) => `Group ${String.fromCharCode(65 + i)}`;

/** Marks plan fixtures that already exist (same ordered pairing, plus reverse pairing when single leg). */
export function findDuplicates(fixtures: Array<Match & { stage?: string }>, existing: Array<{ home: string; away: string; status?: string }>, singleLeg: boolean): boolean[] {
  const keys = new Set<string>();
  for (const e of existing) { if (e.status === 'cancelled') continue; keys.add(`${e.home}|${e.away}`); if (singleLeg) keys.add(`${e.away}|${e.home}`); }
  return fixtures.map(f => keys.has(`${f.home}|${f.away}`));
}
