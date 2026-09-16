import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = path.join(root, 'server', 'apiEntrypoint.ts');
if (!fs.existsSync(entryPath)) throw new Error('Pitchline API entrypoint is missing.');

// Vercel builds must not mutate tracked source files. Older preparation logic rewrote
// realtime and API source files in-place, which coupled builds to previous build runs.
// Transform only the temporary entry used for bundling.
const original = fs.readFileSync(entryPath, 'utf8');
const transformed = original
  .replace("from './appdeployCompat';", "from './appdeployCompat.ts';")
  .replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')")
  .replace(
    "relatedPlayer: String(input.player || input.relatedPlayer || '').trim(),",
    "relatedPlayer: String(input.relatedPlayer || input.player || '').trim(),"
  );

const buildDir = path.join(root, '.vercel-build');
fs.mkdirSync(buildDir, { recursive: true });
const tempEntry = path.join(buildDir, 'apiEntrypoint.ts');
fs.writeFileSync(tempEntry, transformed);

try {
  buildSync({
    entryPoints: [tempEntry],
    outfile: path.join(root, 'server', 'apiRuntime.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'external',
    legalComments: 'none',
    sourcemap: false,
  });
} finally {
  fs.rmSync(buildDir, { recursive: true, force: true });
}

console.log('Pitchline Vercel runtime bundle generated without mutating tracked source.');
