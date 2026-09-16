import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = path.join(root, 'server', 'apiEntrypoint.ts');
if (!fs.existsSync(entryPath)) throw new Error('Pitchline API entrypoint is missing.');

// Keep Vercel builds deterministic and side-effect free. Older AppDeploy-era
// preparation mutated tracked source files before bundling. The current build
// transforms the entry in memory and preserves its original module resolution root.
const original = fs.readFileSync(entryPath, 'utf8');
const transformed = original
  .replace("from './appdeployCompat';", "from './appdeployCompat.ts';")
  .replace("import('./appdeployCompat')", "import('./appdeployCompat.ts')")
  .replace(
    "relatedPlayer: String(input.player || input.relatedPlayer || '').trim(),",
    "relatedPlayer: String(input.relatedPlayer || input.player || '').trim(),"
  );

buildSync({
  stdin: {
    contents: transformed,
    resolveDir: path.dirname(entryPath),
    sourcefile: 'server/apiEntrypoint.ts',
    loader: 'ts',
  },
  outfile: path.join(root, 'server', 'apiRuntime.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  legalComments: 'none',
  sourcemap: false,
});

console.log('Pitchline Vercel runtime bundle generated without mutating tracked source.');
