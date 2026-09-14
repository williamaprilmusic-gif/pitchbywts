import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const failures = [];
const fail = (message) => failures.push(message);
const read = (path) => readFileSync(path, 'utf8');

const backend = read('backend/index.ts');
const client = read('src/platformClient.ts');
const auth = read('server/auth.ts');
const adapter = read('server/appdeployCompat.ts');
const api = read('api/index.ts');
const realtime = read('backend/realtime-subscribers.ts');

const assertions = [
  ['backend no longer imports AppDeploy SDK', !backend.includes("from '@appdeploy/sdk'")],
  ['realtime subscribers no longer import AppDeploy SDK', !realtime.includes("from '@appdeploy/sdk'")],
  ['frontend no longer depends on AppDeploy client import', !client.includes('@appdeploy/client')],
  ['backend uses the Vercel compatibility runtime', backend.includes("from '../server/appdeployCompat'")],
  ['Vercel static API entrypoint exists', existsSync('api/index.ts') && api.includes("await import('../backend/index')")],
  ['Vercel API route rewrite exists', read('vercel.json').includes('"/api/:path*"') && read('vercel.json').includes('/api/index')],
  ['HttpOnly session cookie is enabled', auth.includes('HttpOnly') && auth.includes('SameSite=Lax')],
  ['session signing is HMAC based', auth.includes('createHmac') && auth.includes("sha256")],
  ['password hashing is scrypt based', auth.includes('scryptSync')],
  ['session secret is mandatory', auth.includes('PITCHLINE_SESSION_SECRET') && auth.includes('at least 32 characters')],
  ['protected routes still use requireAuth', backend.includes('requireAuth()')],
  ['role isolation remains present', backend.includes('requireLfaAdmin') && backend.includes('requireAnyRole')],
  ['Postgres adapter uses DATABASE_URL', adapter.includes('DATABASE_URL') && adapter.includes('@neondatabase/serverless')],
  ['adapter exposes list/get/add/update/delete operations', ['list', 'get', 'add', 'update', 'delete'].every(token => new RegExp(`\\b${token}\\s*[:(]`).test(adapter))],
  ['placeholder authentication error is gone', !client.includes('authentication is not configured on Vercel yet')],
  ['frontend credentials are sent as cookies', client.includes("credentials: 'include'")],
];

for (const [label, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) fail(label);
}

try {
  const legacyImports = execFileSync('git', ['grep', '-n', "from '@appdeploy/sdk'", '--', 'backend', 'src', 'server', 'api'], { encoding: 'utf8' }).trim();
  if (legacyImports) {
    console.error(legacyImports);
    fail('legacy AppDeploy SDK imports remain in backend/runtime source');
  }
} catch (error) {
  if (error.status !== 1) fail('git grep legacy-import audit failed');
}

try {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', env: process.env });
  console.log('PASS  Vite application build');
} catch {
  fail('npm run build failed');
}

if (failures.length) {
  for (const failure of failures) console.error(`DEEP REVIEW FAIL: ${failure}`);
  console.error('DEEP REVIEW VERDICT: FAIL');
  process.exit(1);
}

console.log('DEEP REVIEW VERDICT: PASS');
