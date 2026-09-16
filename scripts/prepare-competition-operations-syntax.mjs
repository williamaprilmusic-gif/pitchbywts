import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/CompetitionOperations.tsx');
let source = fs.readFileSync(file, 'utf8');
const before = source;
source = source.replaceAll('/>)}', '/>}');
source = source.replaceAll('busy={busy}/>}</Panel>', 'busy={busy}/>)}</Panel>');
if (source !== before) {
  fs.writeFileSync(file, source);
  console.log('Competition operations JSX syntax normalized.');
} else {
  console.log('Competition operations JSX syntax already normalized.');
}
