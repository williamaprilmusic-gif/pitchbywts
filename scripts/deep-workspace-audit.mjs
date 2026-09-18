import fs from 'node:fs';

const appPath='src/App.tsx';
const source=fs.readFileSync(appPath,'utf8');

const navMatch=source.match(/const roleItems:Array<[^>]+>= \[(.*?)\n\];/s);
if(!navMatch) throw new Error('WORKSPACE AUDIT: canonical roleItems block not found');

const items=[...navMatch[1].matchAll(/\{tab:'([^']+)',label:'([^']+)'[^\n]*roles:\[([^\]]*)\]\}/g)]
  .map(m=>({tab:m[1],label:m[2],roles:m[3]}));

const tabs=items.map(x=>x.tab);
const labels=items.map(x=>x.label);
const duplicate=(values)=>values.filter((v,i)=>values.indexOf(v)!==i);

const failures=[];
if(items.length>25) failures.push('workspace count '+items.length+' exceeds the 25-workspace ceiling');
for(const tab of duplicate(tabs)) failures.push('duplicate navigation tab: '+tab);
for(const label of duplicate(labels)) failures.push('duplicate navigation label: '+label);

for(const item of items){
  if(!source.includes("tab==='"+item.tab+"'") && item.tab!=='home'){
    failures.push('navigation item has no rendered workspace branch: '+item.tab+' ('+item.label+')');
  }
}

const expectedCanonical=[
  'home','fixtures','table','public','live-match','portal',
  'squad','matchday','performance','club','club-management',
  'player-family-system','teams','finance','communications','reports',
  'registration','officials','discipline','scheduling','competition-operations',
  'control-tower','matchday-command','compliance-governance',
  'executive-command','access-management'
];
for(const tab of expectedCanonical){
  if(!tabs.includes(tab)) failures.push('canonical workspace missing from navigation: '+tab);
}

if(!source.includes('WTS_WORKSPACE_CONSOLIDATION_APPLIED')){
  failures.push('canonical workspace consolidation marker missing');
}

console.log('WORKSPACE AUDIT: '+items.length+' visible workspaces');
console.log('WORKSPACE AUDIT: '+items.map(x=>x.label).join(' | '));

if(failures.length){
  console.error('WORKSPACE AUDIT: FAIL');
  for(const failure of failures) console.error(' - '+failure);
  process.exit(1);
}

console.log('WORKSPACE AUDIT: PASS');
