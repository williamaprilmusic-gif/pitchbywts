import fs from 'node:fs';

const source=fs.readFileSync('src/App.tsx','utf8');
const failures=[];
const fail=(message)=>failures.push(message);

if(!source.includes('PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED')) fail('canonical information architecture marker missing');

const groups=source.match(/const roleNavGroups:RoleNavGroup\[\]=\[(.*?)\];/s)?.[1]||'';
const groupIds=[...groups.matchAll(/\{id:'([^']+)',label:'([^']+)'/g)].map(m=>m[1]);
const tabs=[...groups.matchAll(/\{tab:'([^']+)',label:'([^']+)'/g)].map(m=>({tab:m[1],label:m[2]}));
const uniqueTabs=new Set(tabs.map(x=>x.tab));

if(groupIds.length!==6) fail('expected six role workspace groups, found '+groupIds.length);
if(uniqueTabs.size>25) fail('visible workspace count '+uniqueTabs.size+' exceeds the 25-workspace ceiling');

const requiredGroups=['football','team','club','league','governance','executive'];
for(const id of requiredGroups) if(!groupIds.includes(id)) fail('missing workspace group: '+id);

const requiredTabs=[
'home','fixtures','table','live-match',
'squad','matchday','performance','player-family-system',
'club-management','teams','finance','communications','reports',
'registration','officials','discipline','scheduling','competition-operations','control-tower','matchday-command',
'compliance-governance','access-management','executive-command'
];
for(const tab of requiredTabs) if(!uniqueTabs.has(tab)) fail('missing canonical workspace: '+tab);

for(const item of tabs){
  if(!source.includes("tab==='"+item.tab+"'")) fail('workspace has no render branch: '+item.tab);
}

if(!source.includes('openNavGroups')) fail('collapsible workspace navigation state missing');
if(!source.includes("className='workspace-nav'")) fail('grouped workspace navigation renderer missing');

console.log('WORKSPACE AUDIT: '+uniqueTabs.size+' visible workspaces across '+groupIds.length+' groups');
console.log('WORKSPACE AUDIT: '+tabs.map(x=>x.label).join(' | '));

if(failures.length){
  console.error('WORKSPACE AUDIT: FAIL');
  for(const item of failures) console.error(' - '+item);
  process.exit(1);
}
console.log('WORKSPACE AUDIT: PASS');
