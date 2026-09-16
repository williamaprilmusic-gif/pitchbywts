import type { IncomingMessage, ServerResponse } from 'node:http';
import { clearSessionCookie, getSessionUser, passwordHash, setSessionCookie, verifyPassword, type AuthUser } from './auth';
import { db } from './appdeployCompat';
import { handler } from '../backend/index.ts';

type VercelRequest = IncomingMessage & { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined> };
type VercelResponse = ServerResponse;
type RecordShape = Record<string, unknown>;

const send = (res: VercelResponse, status: number, body: unknown, requestId?: string) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (requestId) res.setHeader('X-Request-Id', requestId);
  res.statusCode = status;
  res.end(JSON.stringify(body));
};

const requestId = () => globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const bodyObject = (body: unknown): RecordShape => body && typeof body === 'object' ? body as RecordShape : {};
const requestIp = (request: VercelRequest) => { const forwarded = request.headers['x-forwarded-for']; const value = Array.isArray(forwarded) ? forwarded[0] : forwarded; return String(value || request.headers['x-real-ip'] || '').split(',')[0].trim().slice(0, 100) || undefined; };

async function writeAudit(record: RecordShape) {
  try { await db.add('audit_log', [{ ...record, createdAt: Date.now() }]); }
  catch (error) { console.error('Pitchline audit write failed', error); }
}

function normalizePath(request: VercelRequest) {
  const routed = request.query?.path;
  const value = Array.isArray(routed) ? routed.join('/') : String(routed || '');
  return value ? `/api/${value.replace(/^\/+/, '')}` : new URL(request.url || '/', 'https://pitchline.local').pathname;
}

async function isLfaAdmin(userId?: string) {
  if (!userId) return false;
  const result = await db.list<RecordShape>('user_roles', { limit: 5000 });
  return result.items.some(item => String(item.userId) === userId && String(item.role) === 'LFA Admin');
}

async function getUserRole(userId: string) {
  const result = await db.list<RecordShape>('user_roles', { limit: 5000 });
  const found = result.items.find(item => String(item.userId) === userId);
  return String(found?.role || 'Supporter');
}

async function getProtectedInvoices(user: AuthUser) {
  const roleRows = await db.list<RecordShape>('user_roles', { limit: 5000 });
  const roleRecord = roleRows.items.find(item => String(item.userId) === user.userId);
  const role = String(roleRecord?.role || 'Supporter');
  if (!['LFA Admin', 'Club'].includes(role)) return { status: 403, body: { error: 'Finance access is restricted to LFA Admin and Club roles.' } };
  const rows = (await db.list<RecordShape>('invoices', { limit: 5000 })).items;
  const clubScope = String(roleRecord?.club || '').trim().toLowerCase();
  const scoped = role === 'LFA Admin' ? rows : rows.filter(row => clubScope && String(row.club || '').trim().toLowerCase() === clubScope);
  const seen = new Set<string>();
  const items = scoped.filter(row => {
    const key = [row.memberRef, row.club, row.item, row.amount, row.dueDate].map(value => String(value ?? '').trim().toLowerCase()).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(row => ({ ...row, status: String(row.status || 'Due') }));
  return { status: 200, body: items };
}

function liveEventFingerprint(input: RecordShape) {
  return JSON.stringify({
    fixtureId: String(input.fixtureId || '').trim(),
    type: String(input.type || '').trim(),
    minute: Number(input.minute || 0),
    clockSeconds: Number(input.clockSeconds || 0),
    team: String(input.team || '').trim(),
    relatedPlayer: String(input.player || input.relatedPlayer || '').trim(),
    playerOffRef: String(input.playerOffRef || '').trim(),
    playerOnRef: String(input.playerOnRef || '').trim(),
    note: String(input.note || '').trim().slice(0, 500),
    goalDetail: String(input.goalDetail || '').trim(),
  });
}

async function findDuplicateLiveEvent(input: RecordShape) {
  const fixtureId = String(input.fixtureId || '').trim();
  if (!fixtureId) return undefined;
  const result = await db.list<RecordShape>('live_events', { limit: 5000 });
  const wanted = liveEventFingerprint(input);
  return result.items.find(item => {
    if (String(item.fixtureId || '') !== fixtureId) return false;
    return liveEventFingerprint(item) === wanted;
  });
}

async function getLiveState(fixtureId: string) {
  const lives = await db.list<RecordShape>('live_matches', { limit: 5000 });
  const live = lives.items.find(item => String(item.fixtureId || '') === fixtureId);
  if (!live) return undefined;
  const events = (await db.list<RecordShape>('live_events', { limit: 5000 })).items
    .filter(item => String(item.fixtureId || '') === fixtureId)
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  return { ...live, events };
}

async function syncFixtureFromLiveMatch(fixtureId: string) {
  const live = await getLiveState(fixtureId);
  if (!live) return;
  const fixture = (await db.get<RecordShape>('fixtures', [fixtureId]))[0];
  if (!fixture) return;
  const status = String(live.status || 'Scheduled');
  const next: RecordShape = {
    ...fixture,
    homeScore: Number(live.homeScore) || 0,
    awayScore: Number(live.awayScore) || 0,
    matchdayStatus:
      status === 'Live' ? 'Live' :
      status === 'Half time' ? 'Half time' :
      status === 'Paused' ? 'Paused' :
      status === 'Full time' ? 'Full time' :
      fixture.matchdayStatus,
  };
  if (status === 'Full time') next.status = 'completed';
  await db.update('fixtures', [{ id: fixtureId, record: next }]);
}

async function authEndpoint(request: VercelRequest, response: VercelResponse, pathname: string, reqId: string) {
  if (pathname === '/api/auth/sign-out' && request.method === 'POST') { clearSessionCookie(response); send(response, 200, { ok: true }, reqId); return true; }
  if (pathname === '/api/auth/me' && request.method === 'GET') { const user = getSessionUser(request); if (!user) send(response, 401, { error: 'Unauthorized', code: 'not_authenticated' }, reqId); else send(response, 200, { user, role: await getUserRole(user.userId) }, reqId); return true; }
  if (pathname === '/api/my-role' && request.method === 'GET') { const user = getSessionUser(request); if (!user) send(response, 401, { error: 'Unauthorized', code: 'not_authenticated' }, reqId); else send(response, 200, { role: await getUserRole(user.userId), user }, reqId); return true; }
  if (pathname !== '/api/auth/sign-in' && pathname !== '/api/auth/sign-up') return false;
  if (request.method !== 'POST') { send(response, 405, { error: 'Method not allowed' }, reqId); return true; }
  try {
    const input = bodyObject(request.body);
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    if (!email || !password) { send(response, 400, { error: 'Email and password are required.', code: 'invalid_request' }, reqId); return true; }
    if (pathname === '/api/auth/sign-up') {
      const name = String(input.name || email).trim().slice(0, 120);
      if (!email.includes('@') || !name || password.length < 10) { send(response, 400, { error: 'Valid email, name and a password of at least 10 characters are required.', code: 'invalid_request' }, reqId); return true; }
      const users = await db.list<RecordShape>('auth_users', { limit: 5000 });
      if (users.items.some(item => String(item.email || '').toLowerCase() === email)) { send(response, 409, { error: 'An account already exists for that email.', code: 'account_exists' }, reqId); return true; }
      const [id] = await db.add('auth_users', [{ email, name, passwordHash: passwordHash(password), createdAt: Date.now() }]);
      await db.add('user_roles', [{ userId: id, role: 'Supporter', updatedAt: Date.now(), source: 'Self registration' }]);
      const user: AuthUser = { userId: id, email, name }; setSessionCookie(response, user); send(response, 201, { user, role: 'Supporter', expiresIn: 60 * 60 * 24 * 7 }, reqId); return true;
    }
    const configuredEmail = String(process.env.PITCHLINE_ADMIN_EMAIL || '').trim().toLowerCase();
    const configuredPassword = String(process.env.PITCHLINE_ADMIN_PASSWORD || '');
    let user: AuthUser | null = null;
    if (configuredEmail && configuredPassword && email === configuredEmail && password === configuredPassword) {
      const users = await db.list<RecordShape>('auth_users', { limit: 5000 });
      let found = users.items.find(item => String(item.email || '').toLowerCase() === email);
      const configuredName = String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator').trim() || 'Pitchline Administrator';
      if (!found) {
        const [id] = await db.add('auth_users', [{ email, name: configuredName, passwordHash: passwordHash(password), createdAt: Date.now() }]);
        found = { id, email, name: configuredName };
      } else if (found.id) {
        await db.update('auth_users', [{ id: String(found.id), record: { ...found, email, name: configuredName, passwordHash: passwordHash(password), updatedAt: Date.now(), source: 'Vercel bootstrap administrator' } }]);
      }
      const roles = await db.list<RecordShape>('user_roles', { limit: 5000 });
      const matchingRoles = roles.items.filter(item => String(item.userId) === String(found?.id));
      if (!matchingRoles.length) {
        await db.add('user_roles', [{ userId: String(found.id), role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' }]);
      } else {
        for (const existingRole of matchingRoles) {
          if (existingRole.id && String(existingRole.role) !== 'LFA Admin') {
            await db.update('user_roles', [{ id: String(existingRole.id), record: { ...existingRole, role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' } }]);
          } else if (existingRole.id && String(existingRole.role) === 'LFA Admin') {
            await db.update('user_roles', [{ id: String(existingRole.id), record: { ...existingRole, role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' } }]);
          }
        }
      }
      user = { userId: String(found.id), email, name: configuredName };
    } else {
      const users = await db.list<RecordShape>('auth_users', { limit: 5000 });
      const found = users.items.find(item => String(item.email || '').toLowerCase() === email);
      if (!found || !verifyPassword(password, String(found.passwordHash || ''))) { send(response, 401, { error: 'Invalid email or password.', code: 'invalid_credentials' }, reqId); return true; }
      user = { userId: String(found.id), email, name: String(found.name || email) };
    }
    const role = await getUserRole(user.userId);
    setSessionCookie(response, user); send(response, 200, { user, role, expiresIn: 60 * 60 * 24 * 7 }, reqId); return true;
  } catch (error) { console.error('Pitchline auth error', error); send(response, 500, { error: error instanceof Error ? error.message : 'Authentication service failed.' }, reqId); return true; }
}

export default async function api(request: VercelRequest, response: VercelResponse) {
  const reqId = requestId();
  const pathname = normalizePath(request);
  const actor = getSessionUser(request);
  const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method || '');
  if (pathname === '/api/_healthcheck' && request.method === 'GET') {
    send(response, 200, { ok: true, runtime: 'vercel-node', databaseConfigured: Boolean(process.env.DATABASE_URL), sessionConfigured: Boolean(process.env.PITCHLINE_SESSION_SECRET), adminBootstrapConfigured: Boolean(process.env.PITCHLINE_ADMIN_EMAIL && process.env.PITCHLINE_ADMIN_PASSWORD), auditLoggingEnabled: Boolean(process.env.DATABASE_URL), timestamp: new Date().toISOString() }, reqId); return;
  }
  if (pathname === '/api/audit-log') {
    if (!actor || !(await isLfaAdmin(actor.userId))) { send(response, 403, { error: 'LFA Admin role required' }, reqId); return; }
    const result = await db.list<RecordShape>('audit_log', { limit: 250 });
    send(response, 200, { items: result.items.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)) }, reqId); return;
  }
  const handled = await authEndpoint(request, response, pathname, reqId);
  if (handled) { if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, ip: requestIp(request) }); return; }
  if (pathname === '/api/invoices' && request.method === 'GET') {
    if (!actor) { send(response, 401, { error: 'Unauthorized', code: 'not_authenticated' }, reqId); return; }
    const result = await getProtectedInvoices(actor);
    send(response, result.status, result.body, reqId);
    return;
  }
  const requestBody = bodyObject(request.body);
  if (request.method === 'POST' && pathname === '/api/team-sheets' && String(requestBody.fixtureId || '').trim()) {
    const fixtureId = String(requestBody.fixtureId).trim();
    const existing = (await db.list<RecordShape>('team_sheets', { limit: 5000 })).items.find(item => String(item.fixtureId || '') === fixtureId);
    if (existing?.id) request.body = { ...requestBody, id: String(existing.id) };
  }
  if (request.method === 'POST' && pathname === '/api/live-match/events-v2' && actor && await isLfaAdmin(actor.userId)) {
    const duplicate = await findDuplicateLiveEvent(requestBody);
    if (duplicate) {
      const fixtureId = String(requestBody.fixtureId || '').trim();
      const current = await getLiveState(fixtureId);
      if (current) {
        send(response, 200, current, reqId);
        await writeAudit({ requestId: reqId, actorId: actor.userId, actorEmail: actor.email, method: request.method || 'POST', path: pathname, outcome: 'idempotent-replay', duplicateEventId: duplicate.id, fixtureId, ip: requestIp(request) });
        return;
      }
    }
  }

  // Harden the live-match start operation at the Vercel boundary. The legacy backend
  // route performs the same persistence, but a non-critical realtime notification or
  // router exception must never turn a successfully persisted kick-off into HTTP 500.
  if (request.method === 'POST' && pathname === '/api/live-match/start') {
    if (!actor || !(await isLfaAdmin(actor.userId))) {
      send(response, actor ? 403 : 401, { error: actor ? 'LFA Admin role required' : 'Unauthorized', code: actor ? 'forbidden' : 'not_authenticated' }, reqId);
      return;
    }
    try {
      const fixtureId = String(requestBody.fixtureId || '').trim();
      if (!fixtureId) { send(response, 400, { error: 'fixtureId is required', code: 'invalid_request' }, reqId); return; }
      const fixture = (await db.get<RecordShape>('fixtures', [fixtureId]))[0];
      if (!fixture) { send(response, 404, { error: 'Fixture not found', code: 'fixture_not_found' }, reqId); return; }
      if (String(fixture.status || '').toLowerCase() === 'completed') { send(response, 409, { error: 'Completed fixtures cannot be started', code: 'fixture_completed' }, reqId); return; }

      const now = Date.now();
      const rows = await db.list<RecordShape>('live_matches', { limit: 5000 });
      const old = rows.items.find(item => String(item.fixtureId || '') === fixtureId);
      if (String(old?.status || '') === 'Live') { send(response, 409, { error: 'Match is already live', code: 'already_live' }, reqId); return; }
      if (String(old?.status || '') === 'Full time') { send(response, 409, { error: 'Match has already finished', code: 'already_finished' }, reqId); return; }

      const base = old || {
        fixtureId,
        status: 'Scheduled',
        elapsedSeconds: 0,
        homeScore: Number(fixture.homeScore) || 0,
        awayScore: Number(fixture.awayScore) || 0,
        updatedAt: now
      };
      const next = { ...base, status: 'Live', startedAt: now, pausedAt: undefined, updatedAt: now };
      let id = old?.id ? String(old.id) : undefined;
      if (id) {
        const updated = await db.update('live_matches', [{ id, record: next }]);
        if (!updated?.[0]) {
          const recovered = await db.add('live_matches', [{ ...next, id }]);
          if (!recovered?.[0]) { send(response, 500, { error: 'Could not start match', code: 'live_match_write_failed' }, reqId); return; }
        }
      } else {
        const ids = await db.add('live_matches', [next]);
        id = ids?.[0] ? String(ids[0]) : undefined;
        if (!id) { send(response, 500, { error: 'Could not start match', code: 'live_match_create_failed' }, reqId); return; }
      }

      try {
        const existingKickoff = (await db.list<RecordShape>('live_events', { limit: 5000 })).items.some(event => String(event.fixtureId || '') === fixtureId && String(event.type || '') === 'Kick-off');
        if (!existingKickoff) await db.add('live_events', [{ fixtureId, type: 'Kick-off', minute: 1, clockSeconds: 0, createdAt: now }]);
      } catch (eventError) {
        console.error('Pitchline kick-off event write failed', { requestId: reqId, fixtureId, error: eventError });
      }

      let live = await getLiveState(fixtureId);
      if (!live) live = { ...next, id, events: [] };

      try { await syncFixtureFromLiveMatch(fixtureId); }
      catch (syncError) { console.error('Pitchline live start fixture sync failed', { requestId: reqId, fixtureId, error: syncError }); }

      // Realtime fan-out is advisory; the persisted live state is authoritative.
      // Never let websocket delivery failure convert a valid state change into 500.
      try {
        const subscribers = await db.list<{entity_type:string;entity_id:string;connection_id:string}>('entity_subscriptions', { limit: 1000 });
        const ids = Array.from(new Set(subscribers.items.filter(s => s.entity_type === 'live-match' && s.entity_id === fixtureId).map(s => s.connection_id)));
        if (ids.length) {
          const { ws } = await import('./appdeployCompat');
          await ws.send(ids, { v: 1, type: 'entity.update', payload: { entity_type: 'live-match', entity_id: fixtureId, data: live } });
        }
      } catch (notifyError) {
        console.error('Pitchline live start realtime notification failed', { requestId: reqId, fixtureId, error: notifyError });
      }

      await writeAudit({ requestId: reqId, actorId: actor.userId, actorEmail: actor.email, method: 'POST', path: pathname, status: 200, fixtureId, outcome: 'live-started', ip: requestIp(request) });
      send(response, 200, live, reqId);
      return;
    } catch (error) {
      console.error('Pitchline start-live error', { requestId: reqId, error });
      if (!response.writableEnded) send(response, 500, { error: error instanceof Error ? error.message : 'Could not start live match.', code: 'live_match_start_failed', requestId: reqId }, reqId);
      return;
    }
  }

  const routeRequest = request as IncomingMessage & { body?: unknown };
  routeRequest.body = request.body;
  routeRequest.url = pathname;
  try { await handler(routeRequest, response); }
  catch (error) { console.error('Pitchline backend error', { requestId: reqId, error }); if (!response.writableEnded) send(response, 500, { error: error instanceof Error ? error.message : 'Backend request failed.', requestId: reqId }, reqId); }
  if (response.statusCode < 400 && request.method === 'POST' && ['/api/live-match/start','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish'].includes(pathname)) {
    const fixtureId = String(requestBody.fixtureId || '').trim();
    if (fixtureId) await syncFixtureFromLiveMatch(fixtureId);
  }
  if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request) });
}
