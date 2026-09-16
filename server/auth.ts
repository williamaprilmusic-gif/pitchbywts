import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type AuthUser = { userId: string; email: string; name: string };

const SESSION_COOKIE = 'pitchline_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_STORAGE_KEY = 'pitchline_session_token';

function sessionSecret() {
  const value = process.env.PITCHLINE_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('PITCHLINE_SESSION_SECRET must be configured with at least 32 characters.');
  return value;
}

export function passwordHash(password: string) {
  if (password.length < 10) throw new Error('Password must be at least 10 characters.');
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [saltHex, hashHex] = String(encoded).split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function sign(value: string) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function encode(user: AuthUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function createSessionToken(user: AuthUser) {
  return encode(user);
}

function decode(token?: string): AuthUser | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    const expected = sign(payload);
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthUser & { exp?: number };
    if (!parsed.userId || !parsed.email || !parsed.name) return null;
    if (Number(parsed.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return { userId: parsed.userId, email: parsed.email, name: parsed.name };
  } catch {
    return null;
  }
}

function cookies(req: IncomingMessage) {
  const header = req.headers.cookie || '';
  const result: Record<string, string> = {};
  for (const item of header.split(';')) {
    const index = item.indexOf('=');
    if (index < 0) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function getSessionUser(req: IncomingMessage) {
  const cookieUser = decode(cookies(req)[SESSION_COOKIE]);
  if (cookieUser) return cookieUser;
  const authorization = String(req.headers.authorization || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) return decode(authorization.slice(7).trim());
  const headerToken = String(req.headers['x-pitchline-session'] || '').trim();
  return decode(headerToken || undefined);
}

export function setSessionCookie(res: ServerResponse, user: AuthUser) {
  const token = encode(user);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
  // The cookie remains the primary HttpOnly session. This signed header is a fallback
  // for browser environments where the Vercel host does not persist the session cookie.
  res.setHeader('X-Pitchline-Session', token);
}

export function clearSessionCookie(res: ServerResponse) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.setHeader('X-Pitchline-Session', '');
}

export const sessionStorageKey = SESSION_STORAGE_KEY;
