import fs from 'node:fs';

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
if (!app.includes("import FootballOperationsHub from './FootballOperationsHub';")) {
  app = app.replace("import CompetitionOperations from './CompetitionOperations';", "import CompetitionOperations from './CompetitionOperations';\nimport FootballOperationsHub from './FootballOperationsHub';");
}
if (!app.includes("'operations-hub'")) {
  app = app.replace("type Tab='home'", "type Tab='operations-hub'|'home'");
  app = app.replace("const roleItems:Array<{tab:Tab;label:string;icon:React.ReactNode;roles:Role[]}>= [", "const roleItems:Array<{tab:Tab;label:string;icon:React.ReactNode;roles:Role[]}>= [\n  {tab:'operations-hub',label:'Football Hub',icon:<Home size={18}/>,roles:['Supporter','Manager','Club','LFA Admin']},");
  app = app.replace("{tab==='home'&&<Dashboard", "{tab==='operations-hub'&&<FootballOperationsHub role={effectiveRole} fixtures={fixtures} players={players} communications={communications} navigate={navigate} setNotice={setNotice}/>} {tab==='home'&&<Dashboard");
  app = app.replace("function labelFor(t:Tab){return({home:'Dashboard'", "function labelFor(t:Tab){return({'operations-hub':'Football Hub',home:'Dashboard'");
}
fs.writeFileSync(appPath, app);

const backendPath = 'backend/index.ts';
let backend = fs.readFileSync(backendPath, 'utf8');
if (!backend.includes("'GET /api/training-sessions'")) {
  const routes = `
  'GET /api/training-sessions':[requireAuth(),async({user})=>{const assignment=await getRoleAssignment(user!.userId);const rows=await listTable<Record<string,unknown>>('training_sessions');const visible=assignment.role==='LFA Admin'||assignment.role==='Club'?rows:assignment.role==='Manager'?rows.filter(r=>String(r.createdBy||'')===user!.userId):[];return json(visible.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.startTime||'').localeCompare(String(b.startTime||''))) }],
  'POST /api/training-sessions':[requireAuth(),requireAnyRole(['LFA Admin','Club','Manager']),async({user,body})=>{const input=body as Record<string,unknown>;const title=String(input.title||'').trim();const team=String(input.team||'').trim();const date=String(input.date||'').trim();const startTime=String(input.startTime||'').trim();const venue=String(input.venue||'').trim();if(!title||!team||!date||!startTime||!venue)return error('title, team, date, startTime and venue are required',400);const assignment=await getRoleAssignment(user!.userId);if(assignment.role==='Manager'&&assignment.team&&assignment.team!==team)return error('You do not have access to this team',403);if(assignment.role==='Club'&&assignment.club&&!teamBelongsToClub(team,assignment.club))return error('You do not have access to this team',403);const record={title,team,date,startTime,venue,status:'Scheduled',createdBy:user!.userId,createdAt:Date.now()};const [id]=await db.add('training_sessions',[record]);if(!id)return error('Could not schedule training session',500);const out={...record,id};await notify('training-sessions','league',await listTable('training_sessions'));return json(out)}],
  'PUT /api/training-sessions/:id':[requireAuth(),requireAnyRole(['LFA Admin','Club','Manager']),async({user,params,body})=>{const old=(await db.get<Record<string,unknown>>('training_sessions',[params.id]))[0];if(!old)return error('Training session not found',404);const assignment=await getRoleAssignment(user!.userId);if(assignment.role==='Manager'&&String(old.createdBy||'')!==user!.userId)return error('You do not have access to this training session',403);if(assignment.role==='Club'&&assignment.club&&!teamBelongsToClub(String(old.team||''),assignment.club))return error('You do not have access to this training session',403);const input=body as Record<string,unknown>;const next={...old,title:String(input.title??old.title).trim(),team:String(input.team??old.team).trim(),date:String(input.date??old.date).trim(),startTime:String(input.startTime??old.startTime).trim(),venue:String(input.venue??old.venue).trim(),status:String(input.status??old.status).trim(),updatedAt:Date.now()};if(!next.title||!next.team||!next.date||!next.startTime||!next.venue)return error('Training fields cannot be empty',400);const ok=await db.update('training_sessions',[{id:params.id,record:next}]);if(!ok[0])return error('Could not update training session',500);return json({...next,id:params.id})}],
  'GET /api/favourites':[requireAuth(),async({user})=>{const rows=await listTable<Record<string,unknown>>('favourites');return json(rows.filter(r=>String(r.userId)===user!.userId).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))) }],
  'POST /api/favourites':[requireAuth(),async({user,body})=>{const input=body as Record<string,unknown>;const entityType=String(input.entityType||'').trim();const entityId=String(input.entityId||'').trim();const label=String(input.label||'').trim().slice(0,200);if(!entityType||!entityId||!label)return error('entityType, entityId and label are required',400);const rows=await listTable<Record<string,unknown>>('favourites');const existing=rows.find(r=>String(r.userId)===user!.userId&&String(r.entityType)===entityType&&String(r.entityId)===entityId);if(existing)return json(existing);const [id]=await db.add('favourites',[{userId:user!.userId,entityType,entityId,label,createdAt:Date.now()}]);if(!id)return error('Could not save favourite',500);return json({id,userId:user!.userId,entityType,entityId,label,createdAt:Date.now()})}],
  'DELETE /api/favourites/:id':[requireAuth(),async({user,params})=>{const old=(await db.get<Record<string,unknown>>('favourites',[params.id]))[0];if(!old)return error('Favourite not found',404);if(String(old.userId)!==user!.userId)return error('You do not have access to this favourite',403);const ok=await db.delete('favourites',[params.id]);if(!ok)return error('Could not remove favourite',500);return json({ok:true,id:params.id})}],
`;
  const marker = "});\n";
  const index = backend.lastIndexOf(marker);
  if (index < 0) throw new Error('Backend router terminator not found.');
  backend = backend.slice(0,index) + routes + backend.slice(index);
  fs.writeFileSync(backendPath, backend);
}
console.log('Pitchline Football Operations Hub integrated.');
