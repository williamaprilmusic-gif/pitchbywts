import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  path.join(root, 'backend', 'realtime.ts'),
  path.join(root, 'backend', 'realtime-subscribers.ts'),
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const original = fs.readFileSync(file, 'utf8');
  const updated = original.replace(/from\s+(['"])(\.\.?\/[^'"\n]+?)\1/g, (match, quote, specifier) => {
    if (/\.(?:js|mjs|cjs|ts|tsx|json)$/.test(specifier)) return match;
    return `from ${quote}${specifier}.js${quote}`;
  });
  if (updated !== original) fs.writeFileSync(file, updated);
}

// Explicitly select the corrected TypeScript compatibility layer. A legacy
// server/appdeployCompat.js exists in the repository and does not contain the
// live-lock API; extensionless resolution can otherwise select that stale file.
const entryPath = path.join(root, 'server', 'apiEntrypoint.ts');
if (fs.existsSync(entryPath)) {
  const original = fs.readFileSync(entryPath, 'utf8');
  let updated = original
    .replace("from './appdeployCompat';", "from './appdeployCompat.ts';")
    .replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')");

  // The dedicated /api/live-match/start handler returns directly before the
  // generic post-handler release boundary. Do not acquire the generic lock for
  // that route; its persisted state transition is atomic and the event routes
  // remain protected by the database lock.
  updated = updated.replace(
    "const liveMutationRoutes = ['/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/start','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish'];",
    "const liveMutationRoutes = ['/api/live-match/events-v2','/api/live-match/events','/api/live-match/undo','/api/live-match/pause','/api/live-match/resume','/api/live-match/finish'];"
  );

  if (updated !== original) fs.writeFileSync(entryPath, updated);
}

// Production integrity repairs are applied in source files; this build step remains deterministic.
buildSync({
  entryPoints: [path.join(root, 'server', 'apiEntrypoint.ts')],
  outfile: path.join(root, 'server', 'apiRuntime.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  legalComments: 'none',
  sourcemap: false,
});

console.log('Pitchline Vercel runtime bundle generated.');
