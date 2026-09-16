import fs from 'node:fs';
const file = 'backend/index.ts';
const source = fs.readFileSync(file, 'utf8');
const from = "from '../server/appdeployCompat';";
const to = "from '../server/appdeployCompat.ts';";
if (source.includes(from)) fs.writeFileSync(file, source.replaceAll(from, to));
console.log('Pitchline runtime module resolution normalized.');
