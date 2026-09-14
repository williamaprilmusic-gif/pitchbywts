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
