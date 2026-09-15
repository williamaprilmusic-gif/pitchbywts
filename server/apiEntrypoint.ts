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
      if (!found) { const [id] = await db.add('auth_users', [{ email, name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator'), passwordHash: passwordHash(password), createdAt: Date.now() }]); found = { id, email, name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator') }; }
      const roles = await db.list<RecordShape>('user_roles', { limit: 5000 });
      const matchingRoles = roles.items.filter(item => String(item.userId) === String(found?.id));
      if (!matchingRoles.length) {
        await db.add('user_roles', [{ userId: String(found.id), role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' }]);
      } else {
        for (const existingRole of matchingRoles) {
          if (String(existingRole.role) !== 'LFA Admin' && existingRole.id) {
            await db.update('user_roles', [{ id: String(existingRole.id), record: { ...existingRole, role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' } }]);
          }
        }
      }
      user = { userId: String(found.id), email, name: String(found.name || 'Pitchline Administrator') };
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
  const routeRequest = request as IncomingMessage & { body?: unknown };
  routeRequest.body = request.body;
  routeRequest.url = pathname;
  try { await handler(routeRequest, response); }
  catch (error) { console.error('Pitchline backend error', { requestId: reqId, error }); if (!response.writableEnded) send(response, 500, { error: error instanceof Error ? error.message : 'Backend request failed.', requestId: reqId }, reqId); }
  if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request) });
}
