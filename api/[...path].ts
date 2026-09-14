import { handler } from '../backend/index';
import { clearSessionCookie, getSessionUser, passwordHash, setSessionCookie, verifyPassword, type AuthUser } from '../server/auth';
import { db } from '../server/appdeployCompat';

type VercelRequest = import('http').IncomingMessage & { query: Record<string, string | string[] | undefined>; body?: unknown; method?: string };
type VercelResponse = import('http').ServerResponse & { status: (code: number) => VercelResponse; json: (body: unknown) => void };

function send(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function inputObject(body: unknown) {
  if (!body || typeof body !== 'object') return {} as Record<string, unknown>;
  return body as Record<string, unknown>;
}

async function ensureConfiguredAdmin(email: string, password: string): Promise<AuthUser | null> {
  const adminEmail = String(process.env.PITCHLINE_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.PITCHLINE_ADMIN_PASSWORD || '');
  if (!adminEmail || !adminPassword || email !== adminEmail || password !== adminPassword) return null;

  const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 });
  let user = users.items.find(item => String(item.email || '').toLowerCase() === email);
  if (!user) {
    const [id] = await db.add('auth_users', [{ email, name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator'), passwordHash: passwordHash(password), createdAt: Date.now() }]);
    user = { id, email, name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator') };
  }

  const roles = await db.list<Record<string, unknown>>('user_roles', { limit: 5000 });
  if (!roles.items.some(item => String(item.userId) === String(user?.id))) {
    await db.add('user_roles', [{ userId: String(user.id), role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' }]);
  }

  return { userId: String(user.id), email, name: String(user.name || process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator') };
}

export default async function api(req: VercelRequest, res: VercelResponse) {
  const queryPath = req.query?.path;
  const path = Array.isArray(queryPath) ? queryPath.join('/') : String(queryPath || '');

  if (path === 'auth/sign-in' && req.method === 'POST') {
    try {
      const input = inputObject(req.body);
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      if (!email || !password) return send(res, 400, { error: 'Email and password are required.', code: 'invalid_request' });
      let user = await ensureConfiguredAdmin(email, password);
      if (!user) {
        const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 });
        const found = users.items.find(item => String(item.email || '').toLowerCase() === email);
        if (!found || !verifyPassword(password, String(found.passwordHash || ''))) return send(res, 401, { error: 'Invalid email or password.', code: 'invalid_credentials' });
        user = { userId: String(found.id), email, name: String(found.name || email) };
      }
      setSessionCookie(res, user);
      return send(res, 200, { user, accessToken: '', expiresIn: 60 * 60 * 24 * 7 });
    } catch (error) {
      console.error('Pitchline sign-in error', error);
      return send(res, 500, { error: error instanceof Error ? error.message : 'Authentication service failed.' });
    }
  }

  if (path === 'auth/sign-up' && req.method === 'POST') {
    try {
      const input = inputObject(req.body);
      const email = String(input.email || '').trim().toLowerCase();
      const name = String(input.name || email).trim().slice(0, 120);
      const password = String(input.password || '');
      if (!email || !email.includes('@') || !name || password.length < 10) return send(res, 400, { error: 'Valid email, name and a password of at least 10 characters are required.', code: 'invalid_request' });
      const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 });
      if (users.items.some(item => String(item.email || '').toLowerCase() === email)) return send(res, 409, { error: 'An account already exists for that email.', code: 'account_exists' });
      const [id] = await db.add('auth_users', [{ email, name, passwordHash: passwordHash(password), createdAt: Date.now() }]);
      if (!id) return send(res, 500, { error: 'Could not create account.', code: 'account_create_failed' });
      await db.add('user_roles', [{ userId: id, role: 'Supporter', updatedAt: Date.now(), source: 'Self registration' }]);
      const user: AuthUser = { userId: id, email, name };
      setSessionCookie(res, user);
      return send(res, 201, { user, accessToken: '', expiresIn: 60 * 60 * 24 * 7 });
    } catch (error) {
      console.error('Pitchline sign-up error', error);
      return send(res, 500, { error: error instanceof Error ? error.message : 'Account service failed.' });
    }
  }

  if (path === 'auth/me' && req.method === 'GET') {
    const user = getSessionUser(req);
    if (!user) return send(res, 401, { error: 'Unauthorized', code: 'not_authenticated' });
    return send(res, 200, { user });
  }

  if (path === 'auth/sign-out' && req.method === 'POST') {
    clearSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  const nodeReq = req as import('http').IncomingMessage & { body?: unknown };
  nodeReq.body = req.body;
  const nodeRes = res as import('http').ServerResponse;
  await handler(nodeReq, nodeRes);
}
