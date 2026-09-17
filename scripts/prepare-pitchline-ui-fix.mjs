import fs from 'node:fs';

const path='src/LiveMatchCentre.tsx';
let source=fs.readFileSync(path,'utf8');

// Every player-specific live incident—including Injury—must expose team + player selection.
const playerCondition="{['Goal', 'Yellow card', 'Red card'].includes(quickType) && <><span className='step-label'>2 · PLAYER / GOALSCORER</span>";
const expandedCondition="{['Goal', 'Yellow card', 'Red card', 'Injury', 'Shot', 'Shot on target', 'Foul'].includes(quickType) && <><span className='step-label'>2 · PLAYER / INCIDENT PLAYER</span>";
if(source.includes(playerCondition)) source=source.replace(playerCondition,expandedCondition);

if(!source.includes('quickDetail')){
  if(source.includes("const [goalDetail, setGoalDetail] = useState('Normal');")) source=source.replace("const [goalDetail, setGoalDetail] = useState('Normal');","const [goalDetail, setGoalDetail] = useState('Normal');\n  const [quickDetail, setQuickDetail] = useState('');");
  else source=source.replace("const [quickPlayer, setQuickPlayer] = useState('');","const [quickPlayer, setQuickPlayer] = useState('');\n  const [quickDetail, setQuickDetail] = useState('');");
}

if(!source.includes("setQuickDetail('')")) source=source.replace("setQuickPlayer('');","setQuickPlayer('');\n    setQuickDetail('');");

const oldValidation="if (['Goal', 'Yellow card', 'Red card'].includes(quickType) && (!quickTeam || !quickPlayer))";
if(source.includes(oldValidation)) source=source.replace(oldValidation,"if (['Goal', 'Yellow card', 'Red card', 'Injury', 'Shot', 'Shot on target', 'Foul'].includes(quickType) && (!quickTeam || !quickPlayer))");

if(!source.includes('incident-detail-field')){
  const marker="            {quickType === 'Substitution' && <div className='admin-grid'>";
  const insert="            {['Injury','Shot','Shot on target','Foul'].includes(quickType) && <div className='admin-grid incident-detail-field'><div><span className='step-label'>{quickType === 'Injury' ? '3 · INJURY DETAIL' : '3 · DETAIL'}</span><input value={quickDetail} onChange={(event)=>setQuickDetail(event.target.value)} placeholder={quickType === 'Injury' ? 'e.g. ankle, head, muscle, stretcher' : 'e.g. open play, header, counter'} /></div></div>}\n\n"+marker;
  source=source.replace(marker,insert);
}
source=source.replace("export default function LiveMatchCentre","// PITCHLINE_UI_FIX\nexport default function LiveMatchCentre");
fs.writeFileSync(path,source);

const cssPath='src/minimal-professional.css';
let css=fs.existsSync(cssPath)?fs.readFileSync(cssPath,'utf8'):'';
if(!css.includes('PITCHLINE_UI_FIX_CSS')){css+='\n/* PITCHLINE_UI_FIX_CSS */\n.incident-detail-field{margin-top:12px}\n';fs.writeFileSync(cssPath,css)}
console.log('Pitchline UI fix: Injury, shots and fouls now require team + player and expose incident detail.');
