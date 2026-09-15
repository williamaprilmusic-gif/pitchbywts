import { db } from './appdeployCompat';

type LiveState = { fixtureId: string; status: string; homeScore: number; awayScore: number; startedAt?: number; pausedAt?: number; elapsedSeconds: number; updatedAt: number; id?: string };

type EventInput = Record<string, unknown>;

export async function syncFixtureFromLive(fixtureId: string, live: LiveState) {
  const fixtures = await db.get<Record<string, unknown>>('fixtures', [fixtureId]);
  const fixture = fixtures[0];
  if (!fixture) return false;
  const nextStatus = live.status === 'Full time' ? 'completed' : live.status === 'Live' ? 'live' : String(fixture.status || 'upcoming');
  const next = {
    ...fixture,
    status: nextStatus,
    matchdayStatus: live.status === 'Full time' ? 'Full time' : live.status,
    homeScore: Number(live.homeScore) || 0,
    awayScore: Number(live.awayScore) || 0,
  };
  const result = await db.update('fixtures', [{ id: fixtureId, record: next }]);
  return Boolean(result[0]);
}

export async function upsertTeamSheet(record: Record<string, unknown>) {
  const fixtureId = String(record.fixtureId || '').trim();
  if (!fixtureId) return { id: undefined as string | undefined, created: false };
  const existing = (await db.list<Record<string, unknown>>('team_sheets', { limit: 5000 })).items.find(x => String(x.fixtureId) === fixtureId);
  if (existing?.id) {
    const ok = await db.update('team_sheets', [{ id: String(existing.id), record: { ...record, id: String(existing.id) } }]);
    if (!ok[0]) return { id: undefined, created: false };
    return { id: String(existing.id), created: false };
  }
  const [id] = await db.add('team_sheets', [record]);
  return { id, created: true };
}

function sameValue(a: unknown, b: unknown) {
  return String(a ?? '').trim() === String(b ?? '').trim();
}

export async function liveEventAlreadyRecorded(fixtureId: string, input: EventInput) {
  const events = (await db.list<Record<string, unknown>>('live_events', { limit: 5000 })).items.filter(e => String(e.fixtureId) === fixtureId);
  const key = String(input.idempotencyKey || input.eventId || '').trim();
  let duplicate = key ? events.find(e => sameValue(e.idempotencyKey, key)) : undefined;
  if (!duplicate) {
    const type = String(input.type || '').trim();
    const team = String(input.team || '').trim();
    const player = String(input.player || '').trim();
    const minute = Number(input.minute) || 0;
    const clock = Number(input.clockSeconds) || 0;
    const note = String(input.note || '').trim();
    const now = Date.now();
    duplicate = events.find(e =>
      now - Number(e.createdAt || 0) <= 5000 &&
      sameValue(e.type, type) && sameValue(e.team, team) && sameValue(e.player, player) &&
      Number(e.minute || 0) === minute && Number(e.clockSeconds || 0) === clock && sameValue(e.note, note)
    );
  }
  if (!duplicate) return null;
  const live = (await db.list<LiveState>('live_matches', { limit: 5000 })).items.find(x => String(x.fixtureId) === fixtureId);
  if (!live) return null;
  const allEvents = (await db.list<Record<string, unknown>>('live_events', { limit: 5000 })).items
    .filter(e => String(e.fixtureId) === fixtureId).sort((a,b) => Number(a.createdAt||0) - Number(b.createdAt||0));
  return { ...live, events: allEvents, duplicate: true };
}
