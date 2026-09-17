import fs from 'node:fs';

const backendPath = 'backend/index.ts';
const appPath = 'src/App.tsx';

let backend = fs.readFileSync(backendPath, 'utf8');
backend = backend.replace(
  "type UserRole='Supporter'|'Manager'|'Club'|'LFA Admin';",
  "type UserRole='Supporter'|'Manager'|'Club'|'Club Manager'|'LFA Admin';"
);
backend = backend.replace(
  "const validRoles:UserRole[]=['Supporter','Manager','Club','LFA Admin'];",
  "const validRoles:UserRole[]=['Supporter','Manager','Club','Club Manager','LFA Admin'];"
);

const anchor = "function requireAnyRole(allowed:UserRole[]): RouterMiddleware { return async (ctx) => { const userId=ctx.user?.userId; if(!userId)return error('Unauthorized',401); const roles=await listTable<{userId:string;role:UserRole}>('user_roles'); const role=roles.find(r=>r.userId===userId)?.role||'Supporter'; if(!allowed.includes(role))return error('Insufficient role permissions',403); }; }";
if (!backend.includes('function requireMatchOperator()')) {
  const helper = `${anchor}\nfunction requireMatchOperator(): RouterMiddleware { return async (ctx) => { const userId=ctx.user?.userId; if(!userId)return error('Unauthorized',401); const roles=await listTable<{userId:string;role:UserRole}>('user_roles'); const role=roles.find(r=>r.userId===userId)?.role||'Supporter'; if(!['LFA Admin','Manager','Club','Club Manager'].includes(role))return error('Match operator role required',403); if(role==='LFA Admin')return; const fixtureId=String((ctx.body as {fixtureId?:string})?.fixtureId||'').trim(); if(!fixtureId)return error('Fixture scope is required',400); const fixture=(await db.get<Fixture>('fixtures',[fixtureId]))[0]; if(!fixture)return error('Fixture not found',404); const assignment=await getRoleAssignment(userId); const identity=await ensureLeagueIdentity(); const home=identity.teams.find(t=>t.id===fixture.homeTeamId||t.name===fixture.home); const away=identity.teams.find(t=>t.id===fixture.awayTeamId||t.name===fixture.away); if((role==='Manager'||role==='Club Manager')&&assignment.clubId&&(home?.clubId===assignment.clubId||away?.clubId===assignment.clubId))return; if((role==='Manager'||role==='Club Manager')&&assignment.club&&((home&&normalizeScope(home.name).startsWith(normalizeScope(assignment.club)))||(away&&normalizeScope(away.name).startsWith(normalizeScope(assignment.club)))))return; if((role==='Manager'||role==='Club Manager')&&assignment.teamId&&(home?.id===assignment.teamId||away?.id===assignment.teamId))return; if((role==='Manager'||role==='Club Manager')&&assignment.team&&(fixture.home===assignment.team||fixture.away===assignment.team))return; if(role==='Club'&&assignment.clubId&&(home?.clubId===assignment.clubId||away?.clubId===assignment.clubId))return; if(role==='Club'&&assignment.club&&(teamBelongsToClub(fixture.home,assignment.club)||teamBelongsToClub(fixture.away,assignment.club)))return; return error('You do not have access to this fixture',403); }; }`;
  if (!backend.includes(anchor)) throw new Error('Live role helper anchor not found.');
  backend = backend.replace(anchor, helper);
}

for (const route of ['start','pause','resume','finish','events-v2','events','undo','verify']) {
  const pattern = new RegExp(`('POST \\/api\\/live-match\\/${route}':\\[requireAuth\\(\\),)requireLfaAdmin\\(\\)`, 'g');
  backend = backend.replace(pattern, '$1requireMatchOperator()');
}

fs.writeFileSync(backendPath, backend);

let app = fs.readFileSync(appPath, 'utf8');
app = app.replace(
  "type Role='Supporter'|'Manager'|'Club'|'LFA Admin';",
  "type Role='Supporter'|'Manager'|'Club'|'Club Manager'|'LFA Admin';"
);
app = app.replace(
  "function canSee(role:Role,tab:Tab){return roleItems.some(item=>item.tab===tab&&item.roles.includes(role));}",
  "function canSee(role:Role,tab:Tab){const allowedRole=role==='Club Manager'?null:role;return roleItems.some(item=>item.tab===tab&&(allowedRole?item.roles.includes(allowedRole):item.roles.includes('Manager')||item.roles.includes('Club')));}"
);
app = app.replace(
  "['Supporter','Manager','Club','LFA Admin'].includes(saved)",
  "['Supporter','Manager','Club','Club Manager','LFA Admin'].includes(saved)"
);
app = app.replace(
  "<option value='Club'>Club</option><option value='LFA Admin'>LFA Admin</option>",
  "<option value='Club'>Club</option><option value='Club Manager'>Club Manager</option><option value='LFA Admin'>LFA Admin</option>"
);
app = app.replace(
  "role==='Manager'?{eyebrow:'MANAGER WORKSPACE'",
  "(role==='Manager'||role==='Club Manager')?{eyebrow:'MANAGER WORKSPACE'"
);
const clubAnchor = "{tab==='club'&&<ClubAdmin registrations={registrations} payments={payments} approve={approve} announcement={announcement} setAnnouncement={setAnnouncement} sendAnnouncement={sendAnnouncement} navigate={navigate}/>}";
if (!app.includes("{tab==='club-management'&&<ClubManagement")) {
  if (!app.includes(clubAnchor)) throw new Error('Club admin render anchor not found.');
  app = app.replace(clubAnchor, `${clubAnchor} {tab==='club-management'&&<ClubManagement role={effectiveRole} setNotice={setNotice}/>} `);
}

// Do not fire protected reads while signed out. The previous App-level Promise.all
// queried member/manager/admin endpoints for every visitor, producing predictable
// 401s and making protected tabs look broken. Public reads remain available;
// protected reads start again when authentication succeeds.
const protectedReads = [
  '/api/players',
  '/api/member-portal',
  '/api/performance',
  '/api/performance-summary',
  '/api/appointments',
  '/api/invoices',
  '/api/notification-summary',
];
for (const route of protectedReads) {
  const needle = `api.get('${route}')`;
  const guarded = `signedIn ? api.get('${route}') : Promise.resolve({data:null})`;
  const index = app.indexOf(needle);
  if (index >= 0 && !app.slice(Math.max(0,index-20), index).includes('signedIn ?')) {
    app = app.slice(0,index) + app.slice(index).replace(needle, guarded);
  }
}

// Reload data/realtime wiring after authentication changes, but never attempt
// authenticated subscription writes for a signed-out visitor.
app = app.replace(
  "conn.ready.then(()=>{const id=conn.connectionId;if(!id)return;['fixtures','teams','players','registrations','payments','officials','discipline','performance','club-applications','invoices','communications'].forEach(entity=>void api.post('/api/subscriptions',{entity_type:entity,entity_id:'league',connection_id:id}))}).catch(()=>undefined);",
  "if(signedIn)conn.ready.then(()=>{const id=conn.connectionId;if(!id)return;['fixtures','teams','players','registrations','payments','officials','discipline','performance','club-applications','invoices','communications'].forEach(entity=>void api.post('/api/subscriptions',{entity_type:entity,entity_id:'league',connection_id:id}))}).catch(()=>undefined);"
);
app = app.replace(
  "return()=>{off();conn.disconnect()}},[]);",
  "return()=>{off();conn.disconnect()}},[signedIn]);"
);

// Signed-out users can preview the public workspace, but protected workspaces
// must not be exposed as clickable previews that immediately fail with 401.
app = app.replace(
  "const requestRole=async(nextRole:Role)=>{if(!signedIn){setRole(nextRole);setNotice(`${nextRole} workspace preview enabled.`);return}",
  "const requestRole=async(nextRole:Role)=>{if(!signedIn&&nextRole!=='Supporter'){setRole('Supporter');setNotice('Sign in to access the '+nextRole+' workspace.');return}if(!signedIn){setRole(nextRole);setNotice(`${nextRole} workspace preview enabled.`);return}"
);

// Give Control Tower an actionable authentication message instead of a generic
// load failure when a stale/expired session reaches the protected API.
app = app.replace(
  "catch{setNotice('Could not load the League Control Tower.')}finally{setLoading(false)}",
  "catch(error){const failure=error as {status?:number;code?:string};setNotice(failure.status===401?'Sign in to access the League Control Tower.':failure.status===403?'You do not have permission to access the League Control Tower.':'Could not load the League Control Tower.')}finally{setLoading(false)}"
);

fs.writeFileSync(appPath, app);

console.log('Canonical live operator authorization, Club Manager compatibility, protected-read gating, and control-tower auth handling applied.');
