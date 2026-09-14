import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const fail = (message) => { console.error(`DEEP REVIEW FAIL: ${message}`); process.exitCode = 1; };
const read = (path) => readFileSync(path, 'utf8');

const backend = read('backend/index.ts');
const client = read('src/platformClient.ts');
const auth = read('server/auth.ts');
const adapter = read('server/appdeployCompat.ts');
const api = read('api/[...path].ts');

const assertions = [
  ['backend no longer imports AppDeploy SDK', !backend.includes("from '@appdeploy/sdk'")],
  ['frontend no longer depends on AppDeploy client import', !client.includes('@appdeploy/client')],
  ['backend uses the Vercel compatibility runtime', backend.includes("from '../server/appdeployCompat'")],
  ['Vercel catch-all API exists', existsSync('api/[...path].ts') && api.includes("handler" )],
  ['HttpOnly session cookie is enabled', auth.includes('HttpOnly') && auth.includes('SameSite=Lax')],
  ['session signing is HMAC based', auth.includes('createHmac') && auth.includes("sha256")],
  ['password hashing is scrypt based', auth.includes('scryptSync')],
  ['session secret is mandatory', auth.includes('PITCHLINE_SESSION_SECRET') && auth.includes('at least 32 characters')],
  ['protected routes still use requireAuth', backend.includes('requireAuth()')],
  ['role isolation remains present', backend.includes('requireLfaAdmin') && backend.includes('requireAnyRole')],
  ['Postgres adapter uses DATABASE_URL', adapter.includes('DATABASE_URL') && adapter.includes('@neondatabase/serverless')],
  ['adapter preserves list/get/add/update/delete semantics', ['list(', 'get(', 'add(', 'update(', 'delete('].every(token => adapter.includes(token))],
  ['placeholder authentication error is gone', !client.includes('authentication is not configured on Vercel yet')],
  ['frontend credentials are sent as cookies', client.includes("credentials: 'include'")],
];

for (const [label, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) fail(label);
}

try {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', env: process.env });
  console.log('PASS  Vite + Vercel function build');
} catch {
  fail('npm run build failed');
}

if (process.exitCode) {
  console.error('DEEP REVIEW VERDICT: FAIL');
  process.exit(1);
}

console.log('DEEP REVIEW VERDICT: PASS');
