import fs from 'node:fs';

const file='src/App.tsx';
const source=fs.readFileSync(file,'utf8');

if(source.includes('WTS_WORKSPACE_CONSOLIDATION_APPLIED')){
  console.log('Canonical WTS workspace consolidation detected; preserving source navigation.');
  process.exit(0);
}

throw new Error('Canonical workspace navigation marker missing. Refusing to apply a legacy information-architecture rewrite.');
