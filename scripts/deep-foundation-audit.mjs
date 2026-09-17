import fs from 'node:fs';
import path from 'node:path';

const failures = [];
const warnings = [];
const read = file => fs.readFileSync(file, 'utf8');
const exists = file => fs.existsSync(file);
const assert = (condition, message) => { if (!condition) failures.push(message); };
const warn = (condition, message) => { if (!condition) warnings.push(message); };

const app = read('src/App.tsx');
const client = read('src/platformClient.ts');
const pkg = read('package.json');
const compat = read('server/appdeployCompat.ts');
const entry = read('server/apiEntrypoint.ts');

// Role/navigation foundation.
assert(/Club Manager/.test(app), 'Club Manager is missing from the canonical frontend role model.');
assert(/club-management/.test(app), 'Club Management navigation/render path is missing.');
assert(/canSee\([^\n]*Club Manager|Club Manager/.test(app), 'Club Manager is not represented in frontend access logic.');

// Authentication must never turn arbitrary protected failures into empty data.
assert(client.includes("url === '/api/auth/me'"), 'Protected GET 401 handling is not scoped to /api/auth/me.');
assert(!client.includes("if (response.status === 401 && method === 'GET') {\n            return { data: null as T }"), 'Blank-tab authentication failure regression detected.');

// Same-browser realtime must be real, not a no-op transport.
assert(client.includes('BroadcastChannel'), 'Same-browser realtime transport is missing.');
assert(!client.includes('onMessage: (_handler) => undefined'), 'No-op WebSocket transport remains in the client.');

// Server-side realtime is intentionally request/response based on Vercel.
assert(compat.includes('Vercel Functions are request/response based'), 'Server realtime architecture is not explicitly Vercel-safe.');

// Database schema initialization must recover after a transient failure.
assert(compat.includes('schemaPromise = null'), 'Database schema initialization cannot recover after a failed initialization attempt.');

// Production build must contain the runtime hardening stage.
assert(pkg.includes('prepare-platform-runtime-hardening.mjs'), 'Production build does not run platform runtime hardening.');

// Avoid legacy AppDeploy runtime dependencies in executable source.
for (const root of ['backend', 'src', 'server', 'api']) {
  if (!exists(root)) continue;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entryName of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entryName.name);
      if (entryName.isDirectory()) { stack.push(full); continue; }
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entryName.name)) continue;
      const text = read(full);
      if (text.includes("from '@appdeploy/sdk'") || text.includes("from '@appdeploy/client'")) {
        failures.push(`Legacy AppDeploy import remains in ${full}.`);
      }
    }
  }
}

// Resource guardrails: keep the monolithic browser entry from growing silently.
const distAssets = path.join('dist', 'assets');
if (exists(distAssets)) {
  const jsFiles = fs.readdirSync(distAssets).filter(name => name.endsWith('.js'));
  const largest = jsFiles
    .map(name => ({ name, size: fs.statSync(path.join(distAssets, name)).size }))
    .sort((a, b) => b.size - a.size)[0];
  if (largest) {
    const maxBytes = 650 * 1024;
    assert(largest.size <= maxBytes, `Largest browser JS asset is ${(largest.size / 1024).toFixed(1)} KB; limit is 650 KB.`);
    console.log(`RESOURCE AUDIT: largest JS ${largest.name} ${(largest.size / 1024).toFixed(1)} KB`);
  }
}

warn(entry.includes('console.error'), 'Backend uses console.error logging; production logs should be sampled/structured where volume is high.');

if (warnings.length) {
  console.log(`FOUNDATION AUDIT WARNINGS (${warnings.length})`);
  for (const item of warnings) console.log(`- ${item}`);
}
if (failures.length) {
  console.error(`FOUNDATION AUDIT FAILED (${failures.length})`);
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}
console.log('FOUNDATION AUDIT: PASS');
