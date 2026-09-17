import fs from 'node:fs';
import path from 'node:path';

const backend=path.resolve('backend/index.ts');
let s=fs.readFileSync(backend,'utf8');
const old="const teams=Array.isArray(input.teams)?Array.from(new Set(input.teams.map(String).filter(Boolean))):[];const requested=Number(input.size)||teams.length;";
const neu="const teamRefs=Array.isArray(input.teams)?Array.from(new Set(input.teams.map(String).filter(Boolean))):[];const registeredTeams=await listTable<Record<string,unknown>>('teams');const teams=teamRefs.map(ref=>registeredTeams.find(t=>String(t.id)===ref||String(t.name)===ref)).filter(Boolean).map(t=>String((t as Record<string,unknown>).name));const requested=Number(input.size)||teams.length;";
const backendMarker='PITCHLINE_COMPETITION_PLATFORM_BACKEND_FIXES_APPLIED';
if(!s.includes(backendMarker)){
  if(!s.includes(old)) throw new Error('bracket team selector patch target not found');
  const before=s;
  s=s.replace(old,neu);
  if(s===before) throw new Error('bracket team selector patch made no change');
  s=`// ${backendMarker}\n${s}`;
  fs.writeFileSync(backend,s);
}else{
  console.log('Competition platform backend fixes already applied; skipping duplicate mutation.');
}

const app=path.resolve('src/CompetitionOperations.tsx');
let a=fs.readFileSync(app,'utf8');
const oldKey="const requestKey=`${name}:${active.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;";
const newKey="const stableBody=JSON.stringify(body,Object.keys(body).sort());const requestKey=`${name}:${active.id}:${stableBody}`;";
const appMarker='PITCHLINE_COMPETITION_PLATFORM_FRONTEND_FIXES_APPLIED';
if(!a.includes(appMarker)){
  if(!a.includes(oldKey)) throw new Error('frontend request key patch target not found');
  const before=a;
  a=a.replace(oldKey,newKey);
  if(a===before) throw new Error('frontend request key patch made no change');
  a=`/* ${appMarker} */\n${a}`;
  fs.writeFileSync(app,a);
}else{
  console.log('Competition platform frontend fixes already applied; skipping duplicate mutation.');
}

console.log('Competition platform hardening fixes applied.');
