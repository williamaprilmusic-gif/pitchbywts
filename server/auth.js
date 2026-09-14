import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'pitchline_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sessionSecret() {
  const value = process.env.PITCHLINE_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('PITCHLINE_SESSION_SECRET must be configured with at least 32 characters.');
  return value;
}

export function passwordHash(password) {
  if (password.length < 10) throw new Error('Password must be at least 10 characters.');
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, encoded) {
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

function sign(value) {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function encode(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(token) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    const expected = sign(payload);
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.userId || !parsed.email || !parsed.name) return null;
    if (Number(parsed.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return { userId: parsed.userId, email: parsed.email, name: parsed.name };
  } catch {
    return null;
  }
}

function cookies(req) {
  const header = req.headers.cookie || '';
  const result = {};
  for (const item of header.split(';')) {
    const index = item.indexOf('=');
    if (index < 0) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function getSessionUser(req) {
  return decode(cookies(req)[SESSION_COOKIE]);
}

export function setSessionCookie(res, user) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(encode(user))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
