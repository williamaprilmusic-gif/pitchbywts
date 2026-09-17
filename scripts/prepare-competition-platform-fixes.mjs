import fs from 'node:fs';
import path from 'node:path';

const backend=path.resolve('backend/index.ts');
let s=fs.readFileSync(backend,'utf8');
const catalogMarker='PITCHLINE_COMPETITION_CATALOG_FULL_SCAN_APPLIED';
const listTableOld="async function listTable<T=Record<string,unknown>>(table:string,limit=100){return (await db.list<T>(table,{limit})).items;}";
const listTableNew="async function listTable<T=Record<string,unknown>>(table:string,limit=100){const effectiveLimit=table==='competition_catalog'?5000:limit;return (await db.list<T>(table,{limit:effectiveLimit})).items;}";
if(!s.includes(catalogMarker)){
  if(!s.includes(listTableOld)) throw new Error('competition catalog pagination target not found');
  s=s.replace(listTableOld,`// ${catalogMarker}\n${listTableNew}`);
  fs.writeFileSync(backend,s);
}else{
  console.log('Competition catalog full-scan fix already applied; skipping duplicate mutation.');
}

const old="const teams=Array.isArray(input.teams)?Array.from(new Set(input.teams.map(String).filter(Boolean))):[];const requested=Number(input.size)||teams.length;";
const neu="const teamRefs=Array.isArray(input.teams)?Array.from(new Set(input.teams.map(String).filter(Boolean))):[];const registeredTeams=await listTable<Record<string,unknown>>('teams');const teams=teamRefs.map(ref=>registeredTeams.find(t=>String(t.id)===ref||String(t.name)===ref)).filter(Boolean).map(t=>String((t as Record<string,unknown>).name));const requested=Number(input.size)||teams.length;";
const backendMarker='PITCHLINE_COMPETITION_PLATFORM_BACKEND_FIXES_APPLIED';
if(!s.includes(backendMarker)){
  if(!s.includes(old)) throw new Error('bracket team selector patch target not found');
  s=s.replace(old,neu);
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
  a=a.replace(oldKey,newKey);
  a=`/* ${appMarker} */\n${a}`;
  fs.writeFileSync(app,a);
}else{
  console.log('Competition platform frontend fixes already applied; skipping duplicate mutation.');
}

console.log('Competition platform hardening fixes applied.');
