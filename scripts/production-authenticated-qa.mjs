const BASE_URL = (process.env.PITCHLINE_BASE_URL || 'https://pitchline-william-april.vercel.app').replace(/\/$/, '');
const EMAIL = String(process.env.PITCHLINE_QA_EMAIL || '').trim();
const PASSWORD = String(process.env.PITCHLINE_QA_PASSWORD || '');
if (!EMAIL || !PASSWORD) { console.error('Missing PITCHLINE_QA_EMAIL or PITCHLINE_QA_PASSWORD GitHub Actions secrets.'); process.exit(2); }
let cookie = '';
const checks = [];
const pass = (name, detail) => { checks.push({ name, status: 'PASS', detail }); console.log(`PASS  ${name}: ${detail}`); };
async function request(path, options = {}) { const headers = new Headers(options.headers || {}); headers.set('Accept','application/json'); if(options.body!==undefined) headers.set('Content-Type','application/json'); if(cookie) headers.set('Cookie',cookie); const response=await fetch(`${BASE_URL}${path}`,{...options,headers,redirect:'manual'}); const setCookie=response.headers.get('set-cookie'); if(setCookie) cookie=setCookie.split(';')[0]; const text=await response.text(); let body=null; try{body=text?JSON.parse(text):null}catch{body=text} return {response,body}; }
async function post(path,body){return request(path,{method:'POST',body:JSON.stringify(body)});}
async function put(path,body){return request(path,{method:'PUT',body:JSON.stringify(body)});}
function expect(r,status,label){if(r.response.status!==status)throw new Error(`${label}: expected HTTP ${status}, got ${r.response.status}: ${JSON.stringify(r.body)}`);return r.body;}
function pick(items,predicate,label){const value=(items||[]).find(predicate);if(!value)throw new Error(`Could not find ${label}`);return value;}
function qaDate(){return new Date(Date.now()+45*86400000).toISOString().slice(0,10);}
async function main(){
  let originalCompetitionId=''; let qaCompetitionId=''; let qaFixtureId=''; let qaArchived=false;
  try {
    const health=await request('/api/_healthcheck'); const hb=expect(health,200,'health check'); if(!hb.databaseConfigured||!hb.sessionConfigured)throw new Error('Production database/session configuration is incomplete.'); pass('Production health','database and session configuration present');
    const login=await post('/api/auth/sign-in',{email:EMAIL,password:PASSWORD}); const lb=expect(login,200,'admin login'); if(lb.role!=='LFA Admin')throw new Error(`QA account is not LFA Admin: ${lb.role}`); pass('Authenticated login','signed in with LFA Admin role');
    expect(await request('/api/auth/me'),200,'auth/me'); pass('Session verification','protected session endpoint accepts authenticated cookie');

    const portfolio=expect(await request('/api/competition-portfolio'),200,'competition portfolio'); const original=pick(portfolio.competitions,c=>Boolean(c.isActive),'active competition'); originalCompetitionId=String(original.id); pass('Production context',`protected active competition is ${original.name}`);

    const qaName=`Pitchline Automated QA ${new Date().toISOString().replace(/[:.]/g,'-')}`;
    const created=expect(await post('/api/competition-portfolio',{name:qaName,type:'League',season:'QA',country:'South Africa',description:'Isolated automated production QA competition.'}),200,'create QA competition'); qaCompetitionId=String(created.id); pass('QA isolation','created separate QA competition');
    expect(await post(`/api/competition-portfolio/${qaCompetitionId}/activate`,{}),200,'activate QA competition'); pass('QA activation','QA competition activated without altering production competition data');

    const homeName=`QA Home ${Date.now()} U14`; const awayName=`QA Away ${Date.now()} U14`;
    const homeTeam=expect(await post('/api/competition-operations/teams',{name:homeName,ageGroup:'U14'}),200,'create QA home team');
    const awayTeam=expect(await post('/api/competition-operations/teams',{name:awayName,ageGroup:'U14'}),200,'create QA away team');
    const homePlayers=[]; for(let i=1;i<=4;i++){const p=expect(await post('/api/competition-operations/players',{name:`QA Home Player ${i}`,team:homeName,memberRef:`QA-H-${Date.now()}-${i}`,position:i===1?'GK':'CM',number:i}),200,'create QA home player');homePlayers.push(p.memberRef);}
    const awayPlayers=[]; for(let i=1;i<=2;i++){const p=expect(await post('/api/competition-operations/players',{name:`QA Away Player ${i}`,team:awayName,memberRef:`QA-A-${Date.now()}-${i}`,position:'CM',number:i}),200,'create QA away player');awayPlayers.push(p.memberRef);}
    pass('QA data setup',`${homeTeam.name} vs ${awayTeam.name} with ${homePlayers.length+awayPlayers.length} players`);

    const context=expect(await request('/api/competition-operations'),200,'QA competition context'); const official=pick(context.officials,o=>String(o.availability).toLowerCase()==='available','available official');
    const venueName=`Pitchline QA Ground ${Date.now()}`; expect(await post('/api/venues',{name:venueName,location:'Automated production QA',availability:'Available'}),200,'create QA venue');
    const fixture=expect(await post('/api/competition-operations/fixtures',{home:homeName,away:awayName,date:qaDate(),time:'23:45',venue:venueName,phase:'Automated QA',matchday:`QA-${Date.now()}`}),200,'create QA fixture'); qaFixtureId=String(fixture.id); pass('Fixture creation',qaFixtureId);

    const appointment=expect(await post('/api/official-appointments',{fixtureId:qaFixtureId,officialId:official.id,role:'Referee'}),200,'assign official'); expect(await put(`/api/official-appointments/${appointment.id}`,{status:'Confirmed'}),200,'confirm official'); pass('Official assignment',`${official.name} assigned and confirmed`);
    expect(await post('/api/team-sheets',{fixtureId:qaFixtureId,formation:'4-3-3',captainRef:homePlayers[0],starters:homePlayers.slice(0,4),substitutes:homePlayers.slice(2,4),attendance:homePlayers}),200,'save team sheet');
    expect(await post('/api/matchday-readiness',{fixtureId:qaFixtureId,venueReady:true,officialsReady:true,teamSheetReady:true,resultReady:false,notes:'Automated production QA'}),200,'save matchday readiness');
    expect(await post('/api/matchday/status',{fixtureId:qaFixtureId,status:'Confirmed'}),200,'confirm matchday'); pass('Matchday preparation','team sheet, readiness and matchday confirmation saved');

    const before=expect(await request('/api/competition-operations'),200,'QA standings before live').standings; const beforeHome=pick(before,t=>t.name===homeName,'QA home standings'); const beforeAway=pick(before,t=>t.name===awayName,'QA away standings');
    const start=expect(await post('/api/live-match/start',{fixtureId:qaFixtureId}),200,'start live match'); if(start.status!=='Live')throw new Error(`Expected Live state, got ${start.status}`); pass('Start live match','Live state entered and persisted');
    const goal=expect(await post('/api/live-match/events-v2',{fixtureId:qaFixtureId,type:'Goal',team:homeName,player:homePlayers[0],minute:5,clockSeconds:300,goalDetail:'QA goal'}),200,'record goal'); if(goal.homeScore!==1||goal.awayScore!==0)throw new Error('Goal did not produce 1-0.'); pass('Goal event','score changed to 1-0');
    expect(await post('/api/live-match/events-v2',{fixtureId:qaFixtureId,type:'Yellow card',team:homeName,player:homePlayers[0],minute:12,clockSeconds:720,note:'QA yellow'}),200,'record yellow card'); pass('Card event','yellow card recorded');
    expect(await post('/api/live-match/events-v2',{fixtureId:qaFixtureId,type:'Substitution',team:homeName,playerOffRef:homePlayers[2],playerOnRef:homePlayers[3],minute:25,clockSeconds:1500}),200,'record substitution'); pass('Substitution event','substitution recorded');
    const duplicate=expect(await post('/api/live-match/events-v2',{fixtureId:qaFixtureId,type:'Goal',team:homeName,player:homePlayers[0],minute:5,clockSeconds:300,goalDetail:'QA goal'}),200,'replay duplicate goal'); if(duplicate.homeScore!==1||(duplicate.events||[]).filter(e=>e.type==='Goal').length!==1)throw new Error('Live-event idempotency failed.'); pass('Event idempotency','duplicate goal replay was safely absorbed');
    const finish=expect(await post('/api/live-match/finish',{fixtureId:qaFixtureId}),200,'finish match'); if(finish.status!=='Full time')throw new Error(`Expected Full time, got ${finish.status}`); pass('Finish match','Full time recorded');
    const verify=expect(await post('/api/live-match/verify',{fixtureId:qaFixtureId}),200,'verify match'); if(!verify.verified)throw new Error('Match verification did not return verified=true.'); pass('Verify result','verified match is locked');
    const report=expect(await request(`/api/live-match/${qaFixtureId}/report`),200,'match report'); const types=new Set((report.events||[]).map(e=>e.type)); for(const type of ['Goal','Yellow card','Substitution','Full time'])if(!types.has(type))throw new Error(`Report missing ${type}.`); if(!report.verified||report.finalScore.home!==1||report.finalScore.away!==0)throw new Error('Persisted match report is inconsistent.'); pass('Result persistence','report contains final score, events and verification');

    const after=expect(await request('/api/competition-operations'),200,'QA standings after test').standings; const afterHome=pick(after,t=>t.name===homeName,'QA home standings after'); const afterAway=pick(after,t=>t.name===awayName,'QA away standings after'); if(Number(afterHome.played)!==Number(beforeHome.played)+1||Number(afterHome.won)!==Number(beforeHome.won)+1||Number(afterHome.points)!==Number(beforeHome.points)+3)throw new Error('QA home standings did not recalculate.'); if(Number(afterAway.played)!==Number(beforeAway.played)+1||Number(afterAway.lost)!==Number(beforeAway.lost)+1)throw new Error('QA away standings did not recalculate.'); pass('Standings recalculation','isolated QA competition table updated correctly');

    expect(await post('/api/auth/sign-out',{}),200,'logout'); const afterLogout=await request('/api/auth/me'); if(afterLogout.response.status!==401)throw new Error(`Session remained valid after logout: HTTP ${afterLogout.response.status}`); pass('Logout','protected session rejected after sign-out');
    cookie=''; const relogin=expect(await post('/api/auth/sign-in',{email:EMAIL,password:PASSWORD}),200,'re-login'); if(relogin.role!=='LFA Admin')throw new Error('Re-login did not restore LFA Admin role.'); const persisted=expect(await request(`/api/live-match/${qaFixtureId}/report`),200,'report after re-login'); if(!persisted.verified||persisted.finalScore.home!==1||(persisted.events||[]).length<4)throw new Error('Production data did not persist after logout/login.'); pass('Logout/login persistence','verified QA match remains available after fresh session');
  } finally {
    try {
      if(qaCompetitionId && originalCompetitionId){ await post(`/api/competition-portfolio/${originalCompetitionId}/activate`,{}); pass('Production restoration','original active competition restored'); }
      if(qaCompetitionId){ const archived=await put(`/api/competition-portfolio/${qaCompetitionId}`,{status:'Archived'}); if(archived.response.status===200){qaArchived=true;pass('QA cleanup','isolated QA competition archived');} }
    } catch(error) { console.error(`CLEANUP WARNING: ${error instanceof Error?error.message:String(error)}`); }
    try { if(cookie) await post('/api/auth/sign-out',{}); } catch {}
  }
  console.log(JSON.stringify({ok:true,fixtureId:qaFixtureId,qaCompetitionId,qaArchived,checks,completedAt:new Date().toISOString()},null,2));
}
main().catch(error=>{console.error(`FAIL  ${error instanceof Error?error.message:String(error)}`);console.error(JSON.stringify({ok:false,checks,completedAt:new Date().toISOString()},null,2));process.exit(1);});
