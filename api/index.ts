import type { IncomingMessage, ServerResponse } from 'node:http';
import { clearSessionCookie, getSessionUser, passwordHash, setSessionCookie, verifyPassword, type AuthUser } from '../server/auth';
import { db } from '../server/appdeployCompat';
import { handler } from '../backend/index.ts';

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = ServerResponse;
type AuditRecord = { id?: string; requestId: string; actorId?: string; actorEmail?: string; method: string; path: string; status: number; ip?: string; createdAt: number };

const applySecurityHeaders = (res: VercelResponse, requestId: string) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
};

const send = (res: VercelResponse, status: number, body: unknown, requestId?: string) => {
  if (requestId) applySecurityHeaders(res, requestId);
  res.statusCode = status;
  res.end(JSON.stringify(body));
};

const bodyObject = (body: unknown) => body && typeof body === 'object' ? body as Record<string, unknown> : {};

function requestId() { return globalThis.crypto?.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function requestIp(request: VercelRequest) { const forwarded = request.headers['x-forwarded-for']; const value = Array.isArray(forwarded) ? forwarded[0] : forwarded; return String(value || request.headers['x-real-ip'] || '').split(',')[0].trim().slice(0, 100) || undefined; }
async function writeAudit(record: AuditRecord) { try { await db.add('audit_log', [{ ...record, createdAt: record.createdAt || Date.now() }]); } catch (error) { console.error('Pitchline audit write failed', error); } }
async function isLfaAdmin(userId?: string) { if (!userId) return false; const roles = await db.list<Record<string, unknown>>('user_roles', { limit: 5000 }); return roles.items.some(item => String(item.userId) === userId && String(item.role) === 'LFA Admin'); }

async function auditEndpoint(request: VercelRequest, response: VercelResponse, reqId: string) {
  const user = getSessionUser(request);
  if (!user || !(await isLfaAdmin(user.userId))) { send(response, 403, { error: 'LFA Admin role required', message: 'LFA Admin role required' }, reqId); return true; }
  if (request.method !== 'GET') { send(response, 405, { error: 'Method not allowed', message: 'Method not allowed' }, reqId); return true; }
  const items = await db.list<AuditRecord>('audit_log', { limit: 250 });
  const pathFilter = String(request.query?.path || '').trim();
  const filtered = (items.items || []).filter(item => !pathFilter || item.path.includes(pathFilter)).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  send(response, 200, { items: filtered, count: filtered.length }, reqId); return true;
}

async function ensureConfiguredAdmin(email: string, password: string): Promise<AuthUser | null> {
  const adminEmail = String(process.env.PITCHLINE_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.PITCHLINE_ADMIN_PASSWORD || '');
  if (!adminEmail || !adminPassword || email !== adminEmail || password !== adminPassword) return null;
  const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 });
  let user = users.items.find(item => String(item.email || '').toLowerCase() === email);
  if (!user) { const [id] = await db.add('auth_users', [{ email, name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator'), passwordHash: passwordHash(password), createdAt: Date.now() }]); user = { id, email, name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator') }; }
  const roles = await db.list<Record<string, unknown>>('user_roles', { limit: 5000 });
  if (!roles.items.some(item => String(item.userId) === String(user?.id))) await db.add('user_roles', [{ userId: String(user.id), role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' }]);
  return { userId: String(user.id), email, name: String(user.name || process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator') };
}

function normalizePath(request: VercelRequest) { const routed = request.query?.path; const route = Array.isArray(routed) ? routed.join('/') : String(routed || ''); if (route) return `/api/${route.replace(/^\/+/, '')}`; return new URL(request.url || '/', 'https://pitchline.local').pathname; }

async function authEndpoint(request: VercelRequest, response: VercelResponse, pathname: string, reqId: string) {
  try {
    if (pathname === '/api/auth/sign-in' && request.method === 'POST') {
      const input = bodyObject(request.body); const email = String(input.email || '').trim().toLowerCase(); const password = String(input.password || '');
      if (!email || !password) return send(response, 400, { error: 'Email and password are required.', code: 'invalid_request' }, reqId);
      let user = await ensureConfiguredAdmin(email, password);
      if (!user) { const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 }); const found = users.items.find(item => String(item.email || '').toLowerCase() === email); if (!found || !verifyPassword(password, String(found.passwordHash || ''))) return send(response, 401, { error: 'Invalid email or password.', code: 'invalid_credentials' }, reqId); user = { userId: String(found.id), email, name: String(found.name || email) }; }
      setSessionCookie(response, user); return send(response, 200, { user, accessToken: '', expiresIn: 60 * 60 * 24 * 7 }, reqId);
    }
    if (pathname === '/api/auth/sign-up' && request.method === 'POST') {
      const input = bodyObject(request.body); const email = String(input.email || '').trim().toLowerCase(); const name = String(input.name || email).trim().slice(0, 120); const password = String(input.password || '');
      if (!email.includes('@') || !name || password.length < 10) return send(response, 400, { error: 'Valid email, name and a password of at least 10 characters are required.', code: 'invalid_request' }, reqId);
      const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 }); if (users.items.some(item => String(item.email || '').toLowerCase() === email)) return send(response, 409, { error: 'An account already exists for that email.', code: 'account_exists' }, reqId);
      const [id] = await db.add('auth_users', [{ email, name, passwordHash: passwordHash(password), createdAt: Date.now() }]); if (!id) return send(response, 500, { error: 'Could not create account.', code: 'account_create_failed' }, reqId);
      await db.add('user_roles', [{ userId: id, role: 'Supporter', updatedAt: Date.now(), source: 'Self registration' }]); const user: AuthUser = { userId: id, email, name }; setSessionCookie(response, user); return send(response, 201, { user, accessToken: '', expiresIn: 60 * 60 * 24 * 7 }, reqId);
    }
    if (pathname === '/api/auth/me' && request.method === 'GET') { const user = getSessionUser(request); if (!user) return send(response, 401, { error: 'Unauthorized', code: 'not_authenticated' }, reqId); return send(response, 200, { user }, reqId); }
    if (pathname === '/api/auth/sign-out' && request.method === 'POST') { clearSessionCookie(response); return send(response, 200, { ok: true }, reqId); }
    return false;
  } catch (error) { console.error('Pitchline auth error', error); return send(response, 500, { error: error instanceof Error ? error.message : 'Authentication service failed.' }, reqId); }
}

export default async function api(request: VercelRequest, response: VercelResponse) {
  const reqId = requestId(); const pathname = normalizePath(request); applySecurityHeaders(response, reqId); const actor = getSessionUser(request); const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method || ''); const startedAt = Date.now();
  if (pathname === '/api/_healthcheck' && request.method === 'GET') return send(response, 200, { ok: true, runtime: 'vercel-node', databaseConfigured: Boolean(process.env.DATABASE_URL), sessionConfigured: Boolean(process.env.PITCHLINE_SESSION_SECRET), adminBootstrapConfigured: Boolean(process.env.PITCHLINE_ADMIN_EMAIL && process.env.PITCHLINE_ADMIN_PASSWORD), auditLoggingEnabled: Boolean(process.env.DATABASE_URL), timestamp: new Date().toISOString() }, reqId);
  if (pathname === '/api/audit-log') { await auditEndpoint(request, response, reqId); return; }
  const authHandled = await authEndpoint(request, response, pathname, reqId); if (authHandled !== false) { if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request), createdAt: Date.now() }); return; }
  const routeRequest = request as IncomingMessage & { body?: unknown }; routeRequest.body = request.body; routeRequest.url = pathname; await handler(routeRequest, response);
  if (mutation) await writeAudit({ requestId: reqId, actorId: actor?.userId, actorEmail: actor?.email, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, ip: requestIp(request), createdAt: Date.now() });
  console.info('Pitchline request', { requestId: reqId, method: request.method || 'GET', path: pathname, status: response.statusCode || 200, durationMs: Date.now() - startedAt });
}
