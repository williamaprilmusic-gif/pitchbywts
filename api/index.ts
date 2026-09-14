import type { IncomingMessage, ServerResponse } from 'node:http';
import { handler } from '../backend/index';
import { clearSessionCookie, getSessionUser, passwordHash, setSessionCookie, verifyPassword, type AuthUser } from '../server/auth';
import { db } from '../server/appdeployCompat';

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = ServerResponse & {
  status?: (code: number) => VercelResponse;
  json?: (body: unknown) => void;
};

const send = (res: VercelResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const bodyObject = (body: unknown) => body && typeof body === 'object' ? body as Record<string, unknown> : {};

async function ensureConfiguredAdmin(email: string, password: string): Promise<AuthUser | null> {
  const adminEmail = String(process.env.PITCHLINE_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.PITCHLINE_ADMIN_PASSWORD || '');
  if (!adminEmail || !adminPassword || email !== adminEmail || password !== adminPassword) return null;

  const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 });
  let user = users.items.find(item => String(item.email || '').toLowerCase() === email);
  if (!user) {
    const [id] = await db.add('auth_users', [{
      email,
      name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator'),
      passwordHash: passwordHash(password),
      createdAt: Date.now(),
    }]);
    user = { id, email, name: String(process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator') };
  }

  const roles = await db.list<Record<string, unknown>>('user_roles', { limit: 5000 });
  if (!roles.items.some(item => String(item.userId) === String(user?.id))) {
    await db.add('user_roles', [{ userId: String(user.id), role: 'LFA Admin', updatedAt: Date.now(), source: 'Vercel bootstrap administrator' }]);
  }

  return { userId: String(user.id), email, name: String(user.name || process.env.PITCHLINE_ADMIN_NAME || 'Pitchline Administrator') };
}

function normalizePath(request: VercelRequest) {
  const query = request.query || {};
  const routed = query.path;
  const route = Array.isArray(routed) ? routed.join('/') : String(routed || '');
  if (route) return `/api/${route.replace(/^\/+/, '')}`;
  const raw = request.url || '/';
  return new URL(raw, 'https://pitchline.local').pathname;
}

async function authEndpoint(request: VercelRequest, response: VercelResponse, pathname: string) {
  try {
    if (pathname === '/api/auth/sign-in' && request.method === 'POST') {
      const input = bodyObject(request.body);
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      if (!email || !password) return send(response, 400, { error: 'Email and password are required.', code: 'invalid_request' });

      let user = await ensureConfiguredAdmin(email, password);
      if (!user) {
        const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 });
        const found = users.items.find(item => String(item.email || '').toLowerCase() === email);
        if (!found || !verifyPassword(password, String(found.passwordHash || ''))) return send(response, 401, { error: 'Invalid email or password.', code: 'invalid_credentials' });
        user = { userId: String(found.id), email, name: String(found.name || email) };
      }

      setSessionCookie(response, user);
      return send(response, 200, { user, accessToken: '', expiresIn: 60 * 60 * 24 * 7 });
    }

    if (pathname === '/api/auth/sign-up' && request.method === 'POST') {
      const input = bodyObject(request.body);
      const email = String(input.email || '').trim().toLowerCase();
      const name = String(input.name || email).trim().slice(0, 120);
      const password = String(input.password || '');
      if (!email.includes('@') || !name || password.length < 10) return send(response, 400, { error: 'Valid email, name and a password of at least 10 characters are required.', code: 'invalid_request' });

      const users = await db.list<Record<string, unknown>>('auth_users', { limit: 5000 });
      if (users.items.some(item => String(item.email || '').toLowerCase() === email)) return send(response, 409, { error: 'An account already exists for that email.', code: 'account_exists' });

      const [id] = await db.add('auth_users', [{ email, name, passwordHash: passwordHash(password), createdAt: Date.now() }]);
      if (!id) return send(response, 500, { error: 'Could not create account.', code: 'account_create_failed' });
      await db.add('user_roles', [{ userId: id, role: 'Supporter', updatedAt: Date.now(), source: 'Self registration' }]);
      const user: AuthUser = { userId: id, email, name };
      setSessionCookie(response, user);
      return send(response, 201, { user, accessToken: '', expiresIn: 60 * 60 * 24 * 7 });
    }

    if (pathname === '/api/auth/me' && request.method === 'GET') {
      const user = getSessionUser(request);
      if (!user) return send(response, 401, { error: 'Unauthorized', code: 'not_authenticated' });
      return send(response, 200, { user });
    }

    if (pathname === '/api/auth/sign-out' && request.method === 'POST') {
      clearSessionCookie(response);
      return send(response, 200, { ok: true });
    }

    return false;
  } catch (error) {
    console.error('Pitchline auth error', error);
    return send(response, 500, { error: error instanceof Error ? error.message : 'Authentication service failed.' });
  }
}

export default async function api(request: VercelRequest, response: VercelResponse) {
  const pathname = normalizePath(request);
  const authHandled = await authEndpoint(request, response, pathname);
  if (authHandled !== false) return;

  const routeRequest = request as IncomingMessage & { body?: unknown };
  routeRequest.body = request.body;
  routeRequest.url = pathname;
  const routeResponse = response as unknown as ServerResponse;
  await handler(routeRequest, routeResponse);
}
