import fs from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve('src/App.tsx');
let source = await fs.readFile(file, 'utf8');

const original = source;

// Production must render real API data only. Keep development placeholders out of the compiled bundle.
const fallbackBlock = /const fallbackFixtures:[\s\S]*?const fallbackInvoices:Invoice\[\]=\[[\s\S]*?\];\n/;
source = source.replace(fallbackBlock, '');

source = source
  .replace('useState(fallbackFixtures)', 'useState<Fixture[]>([])')
  .replace('useState(fallbackTeams)', 'useState<Team[]>([])')
  .replace('useState(fallbackPlayers)', 'useState<Player[]>([])')
  .replace('useState(fallbackRegs)', 'useState<Registration[]>([])')
  .replace('useState(fallbackPayments)', 'useState<Payment[]>([])')
  .replace('useState(fallbackOfficials)', 'useState<Official[]>([])')
  .replace('useState(fallbackPortal)', "useState<PortalState>({team:'',fixtureId:null,availability:'pending',notifications:false,payments:[],announcements:[]})")
  .replace('useState(fallbackInvoices)', 'useState<Invoice[]>([])')
  .replace("useState('LP-001')", "useState('')")
  .replace("useState('60')", "useState('')")
  .replace("useState('7.5')", "useState('')")
  .replace("setNotice('Using demo data until the service data syncs.')", "setNotice('Live data could not be synchronized. Check the service connection.')");

// Remove the remaining hard-coded league-position sample value from the dashboard.
source = source.replace(
  "<Stat icon={<Trophy/>} label='League position' value='#1' detail='19 points · +12 GD'/>",
  "<Stat icon={<Trophy/>} label='League position' value={teams.length?'Live':'—'} detail={teams.length?`${teams.length} clubs tracked`:'No live standings data'}/>"
);

if (source === original) throw new Error('Production UI transformer made no changes; source layout may have changed.');
if (/const fallbackFixtures:/.test(source) || /Using demo data/.test(source) || /New registration 01/.test(source)) {
  throw new Error('Demo fallback content is still present after production transformation.');
}

await fs.writeFile(file, source, 'utf8');
console.log('Pitchline production UI transformed: fallback demo state removed.');
