import fs from 'node:fs';

const path = 'src/MatchdayCommandCentre.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('PITCHLINE_MATCHDAY_OPS')) {
  source = source.replace(
    "type Readiness={id?:string;fixtureId:string;venueReady:boolean;officialsReady:boolean;teamSheetReady:boolean;resultReady:boolean;notes:string;updatedAt:number};",
    "type Readiness={id?:string;fixtureId:string;venueReady:boolean;officialsReady:boolean;teamSheetReady:boolean;resultReady:boolean;postMatchSignedOff?:boolean;homeKit?:string;awayKit?:string;weather?:string;medicalLog?:string;commissionerNotes?:string;refereeReport?:string;notes:string;updatedAt:number};"
  );
  source = source.replace(
    "const [ready,setReady]=useState<Readiness>({fixtureId:'',venueReady:false,officialsReady:false,teamSheetReady:false,resultReady:false,notes:'',updatedAt:0});",
    "const [ready,setReady]=useState<Readiness>({fixtureId:'',venueReady:false,officialsReady:false,teamSheetReady:false,resultReady:false,postMatchSignedOff:false,homeKit:'',awayKit:'',weather:'',medicalLog:'',commissionerNotes:'',refereeReport:'',notes:'',updatedAt:0});"
  );
  source = source.replace(
    "existing||{fixtureId:selected.id,venueReady:selected.matchdayStatus==='Confirmed',officialsReady:appointments.length>0,teamSheetReady:Boolean(sheet),resultReady:false,notes:'',updatedAt:0}",
    "existing||{fixtureId:selected.id,venueReady:selected.matchdayStatus==='Confirmed',officialsReady:appointments.length>0,teamSheetReady:Boolean(sheet),resultReady:false,postMatchSignedOff:false,homeKit:'',awayKit:'',weather:'',medicalLog:'',commissionerNotes:'',refereeReport:'',notes:'',updatedAt:0}"
  );
  const readinessGrid = " <div className='readiness-grid'><CheckRow label='Venue ready' checked={ready.venueReady} onChange={v=>setReady(r=>({...r,venueReady:v}))} icon={<Home/>}/><CheckRow label='Officials ready' checked={ready.officialsReady} onChange={v=>setReady(r=>({...r,officialsReady:v}))} icon={<Shield/>}/><CheckRow label='Team sheet ready' checked={ready.teamSheetReady} onChange={v=>setReady(r=>({...r,teamSheetReady:v}))} icon={<ClipboardCheck/>}/><CheckRow label='Result ready' checked={ready.resultReady} onChange={v=>setReady(r=>({...r,resultReady:v}))} icon={<Trophy/>}/></div>";
  const operationalPanel = readinessGrid + "<div className='matchday-ops-grid'><div><label className='label'>HOME KIT</label><input value={ready.homeKit||''} onChange={e=>setReady(r=>({...r,homeKit:e.target.value}))} placeholder='e.g. Red shirt / white shorts'/></div><div><label className='label'>AWAY KIT</label><input value={ready.awayKit||''} onChange={e=>setReady(r=>({...r,awayKit:e.target.value}))} placeholder='e.g. Green / white'/></div><div><label className='label'>WEATHER / CONDITIONS</label><input value={ready.weather||''} onChange={e=>setReady(r=>({...r,weather:e.target.value}))} placeholder='e.g. Dry, wind 12 km/h, good surface'/></div><div><label className='label'>MEDICAL / INJURY LOG</label><textarea value={ready.medicalLog||''} onChange={e=>setReady(r=>({...r,medicalLog:e.target.value}))} placeholder='Medical observations, treatment or incidents'/></div><div><label className='label'>MATCH COMMISSIONER NOTES</label><textarea value={ready.commissionerNotes||''} onChange={e=>setReady(r=>({...r,commissionerNotes:e.target.value}))} placeholder='Commissioner notes'/></div><div><label className='label'>REFEREE REPORT</label><textarea value={ready.refereeReport||''} onChange={e=>setReady(r=>({...r,refereeReport:e.target.value}))} placeholder='Referee report / disciplinary observations'/></div></div>";
  if (source.includes(readinessGrid)) source = source.replace(readinessGrid, operationalPanel);

  const signoff = "<div className='postmatch-signoff'><CheckRow label='Post-match sign-off' checked={Boolean(ready.postMatchSignedOff)} onChange={v=>setReady(r=>({...r,postMatchSignedOff:v}))} icon={<Check/>}/><span className='muted small'>Confirms the operational record is complete for league review.</span></div>";
  const resultBox = " <div className='result-box'>";
  if (!source.includes('postmatch-signoff')) source = source.replace(resultBox, signoff + resultBox);

  source = source.replace("export default function MatchdayCommandCentre", "// PITCHLINE_MATCHDAY_OPS\nexport default function MatchdayCommandCentre");
  fs.writeFileSync(path, source);
}

const cssPath = 'src/minimal-professional.css';
let css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
if (!css.includes('PITCHLINE_MATCHDAY_OPS_CSS')) {
  css += `\n/* PITCHLINE_MATCHDAY_OPS_CSS */\n.matchday-ops-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.matchday-ops-grid input,.matchday-ops-grid textarea{width:100%;box-sizing:border-box}.matchday-ops-grid textarea{min-height:76px;resize:vertical}.postmatch-signoff{display:flex;align-items:center;gap:12px;margin:14px 0;padding:12px 14px;border:1px solid rgba(120,140,135,.18);border-radius:12px}.postmatch-signoff .readiness-row{flex:1}@media(max-width:800px){.matchday-ops-grid{grid-template-columns:1fr}.postmatch-signoff{align-items:flex-start;flex-direction:column}}\n`;
  fs.writeFileSync(cssPath, css);
}

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const build = String(pkg.scripts?.build || '');
if (pkg.scripts?.build && !build.includes('prepare-pitchline-matchday-ops.mjs')) {
  pkg.scripts.build = build.replace('node scripts/prepare-pitchline-workflows.mjs && vite build', 'node scripts/prepare-pitchline-workflows.mjs && node scripts/prepare-pitchline-matchday-ops.mjs && vite build');
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

console.log('Pitchline matchday operations enhanced: kits, conditions, medical log, commissioner notes, referee report and post-match sign-off.');
