const BASE_URL = (process.env.PITCHLINE_BASE_URL || 'https://pitchline-theta.vercel.app').replace(/\/$/, '');
const EMAIL = String(process.env.PITCHLINE_QA_EMAIL || '').trim();
const PASSWORD = String(process.env.PITCHLINE_QA_PASSWORD || '');
if (!EMAIL || !PASSWORD) { console.error('Missing QA credentials for cleanup.'); process.exit(2); }
let cookie = '';
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (cookie) headers.set('Cookie', cookie);
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await response.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}
const login = await request('/api/auth/sign-in', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
if (login.response.status !== 200 || login.body?.role !== 'LFA Admin') throw new Error(`QA cleanup login failed: HTTP ${login.response.status}`);
const cleanup = await request('/api/admin/qa-cleanup', { method: 'POST', body: JSON.stringify({}) });
if (cleanup.response.status !== 200 || !cleanup.body?.ok) throw new Error(`QA cleanup failed: HTTP ${cleanup.response.status}: ${JSON.stringify(cleanup.body)}`);
console.log(`Production QA cleanup removed ${cleanup.body.fixturesRemoved} fixture(s) and ${cleanup.body.removed} related QA record(s).`);
await request('/api/auth/sign-out', { method: 'POST', body: JSON.stringify({}) });
