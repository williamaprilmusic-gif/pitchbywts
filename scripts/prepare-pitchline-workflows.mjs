import fs from 'node:fs';

// PITCHLINE_WORKFLOW_VALIDATED_2026_09_17
const apiPath = 'server/apiEntrypoint.ts';
let api = fs.readFileSync(apiPath, 'utf8');

// Player-specific live incidents must always identify both the team and player.
if (!api.includes('PITCHLINE_PLAYER_EVENT_VALIDATION')) {
  const marker = "  const requestBody = bodyObject(request.body);";
  const validation = [
    '  // PITCHLINE_PLAYER_EVENT_VALIDATION',
    "  if (request.method === 'POST' && pathname === '/api/live-match/events-v2') {",
    "    const playerEventTypes = new Set(['Goal','Yellow card','Red card','Injury','Shot','Shot on target','Foul']);",
    "    const eventType = String(requestBody.type || '').trim();",
    "    if (playerEventTypes.has(eventType) && (!String(requestBody.team || '').trim() || !String(requestBody.player || '').trim())) {",
    "      send(response, 400, { error: eventType + ' requires both a team and player.', code: 'player_required', fixtureId: String(requestBody.fixtureId || '').trim() }, reqId);",
    '      return;',
    '    }',
    '  }',
  ].join('\n');
  if (api.includes(marker)) api = api.replace(marker, marker + '\n' + validation);
}

// Finish Match becomes an integrated workflow: live ledger -> performance -> discipline ->
// match intelligence/report -> readiness -> standings -> supporter publication.
if (!api.includes('PITCHLINE_AUTO_FINISH_WORKFLOW')) {
  const exportIndex = api.indexOf('export default async function api(');
  if (exportIndex < 0) throw new Error('Pitchline finish workflow: api export not found');

  const helper = [
    'async function finalizeMatchWorkflow(fixtureId: string, actor?: AuthUser) {',
    '  const live = await getLiveState(fixtureId);',
    "  if (!live || String(live.status) !== 'Full time') return;",
    "  const fixture = (await db.get<RecordShape>('fixtures', [fixtureId]))[0];",
    '  if (!fixture) return;',
    "  const events = Array.isArray(live.events) ? live.events : [];",
    "  const sheets = (await db.list<RecordShape>('team_sheets', { limit: 5000 })).items.filter(row => String(row.fixtureId || '') === fixtureId);",
    '  const sheet = sheets[0] || {};',
    "  const starters = new Set(Array.isArray(sheet.starters) ? sheet.starters.map(String) : []);",
    '  const stats = new Map<string, RecordShape>();',
    '  const ensurePlayer = (ref: string, team: string) => {',
    "    const key = String(ref || '').trim(); if (!key) return undefined;",
    "    if (!stats.has(key)) stats.set(key, { fixtureId, playerRef:key, team, appearance:starters.has(key)?'Starter':'Substitute', minutes:starters.has(key)?Math.max(1,Math.round(Number(live.elapsedSeconds||0)/60)):0, goals:0, assists:0, yellow:0, red:0, shots:0, shotsOnTarget:0, fouls:0, injuries:0, rating:6, motm:false, updatedAt:Date.now() });",
    '    return stats.get(key);',
    '  };',
    "  for (const ref of starters) ensurePlayer(ref, '');",
    '  for (const event of events) {',
    "    const type=String(event.type||''); const team=String(event.team||''); const player=String(event.player||'').trim(); const row=ensurePlayer(player,team);",
    "    if(type==='Goal'&&row) row.goals=Number(row.goals||0)+1;",
    "    if(type==='Yellow card'&&row) row.yellow=Number(row.yellow||0)+1;",
    "    if(type==='Red card'&&row) row.red=Number(row.red||0)+1;",
    "    if(type==='Shot'&&row) row.shots=Number(row.shots||0)+1;",
    "    if(type==='Shot on target'&&row){row.shotsOnTarget=Number(row.shotsOnTarget||0)+1;row.shots=Number(row.shots||0)+1;}",
    "    if(type==='Foul'&&row) row.fouls=Number(row.fouls||0)+1;",
    "    if(type==='Injury'&&row) row.injuries=Number(row.injuries||0)+1;",
    "    if(type==='Goal'&&event.relatedPlayer){const assist=ensurePlayer(String(event.relatedPlayer),team);if(assist)assist.assists=Number(assist.assists||0)+1;}",
    "    if(type==='Substitution'){const off=ensurePlayer(String(event.playerOffRef||''),team);const on=ensurePlayer(String(event.playerOnRef||''),team);if(off)off.minutes=Math.min(Number(off.minutes||0),Number(event.minute||1));if(on){on.appearance='Substitute';on.minutes=Math.max(0,Math.round(Number(live.elapsedSeconds||0)/60)-Number(event.minute||0));}}",
    '  }',
    '  const rows=Array.from(stats.values());',
    '  for(const row of rows){const score=6+Number(row.goals||0)*1.2+Number(row.assists||0)*0.7+Number(row.shotsOnTarget||0)*0.2-Number(row.yellow||0)*0.35-Number(row.red||0)*1.2-Number(row.injuries||0)*0.15+Number(row.fouls||0)*0.03;row.rating=Math.max(1,Math.min(10,Math.round(score*10)/10));}',
    "  const motm=rows.filter(row=>Number(row.minutes||0)>0).sort((a,b)=>Number(b.rating||0)-Number(a.rating||0))[0];if(motm)motm.motm=true;",
    "  const performance=(await db.list<RecordShape>('performance',{limit:5000})).items;",
    "  for(const row of rows){const old=performance.find(p=>String(p.fixtureId||'')===fixtureId&&String(p.playerRef||'')===String(row.playerRef||''));if(old?.id)await db.update('performance',[{id:String(old.id),record:{...old,...row}}]);else await db.add('performance',[row]);}",
    "  const discipline=(await db.list<RecordShape>('discipline',{limit:5000})).items;",
    "  for(const event of events.filter(e=>['Yellow card','Red card'].includes(String(e.type||'')))){const ref=String(event.player||'').trim();if(!ref)continue;const exists=discipline.find(d=>String(d.fixtureId||'')===fixtureId&&String(d.memberRef||'')===ref&&String(d.type||'')===String(event.type));if(!exists)await db.add('discipline',[{memberRef:ref,fixtureId,type:String(event.type),status:'Recorded',minute:Number(event.minute||0),createdAt:Date.now()}]);}",
    "  const home=String(fixture.home||'').trim(), away=String(fixture.away||'').trim();",
    "  const homeEvents=events.filter(e=>String(e.team||'').trim()===home), awayEvents=events.filter(e=>String(e.team||'').trim()===away);",
    "  const ph=homeEvents.filter(e=>['Possession','Shot','Shot on target','Corner','Free kick'].includes(String(e.type||''))).length, pa=awayEvents.filter(e=>['Possession','Shot','Shot on target','Corner','Free kick'].includes(String(e.type||''))).length, pt=ph+pa;",
    "  const recent=events.slice(-10), mh=recent.filter(e=>String(e.team||'').trim()===home&&['Goal','Shot on target','Corner','Free kick','Penalty'].includes(String(e.type||''))).length, ma=recent.filter(e=>String(e.team||'').trim()===away&&['Goal','Shot on target','Corner','Free kick','Penalty'].includes(String(e.type||''))).length;",
    "  const report={fixtureId,summary:home+' '+(Number(live.homeScore)||0)+'-'+(Number(live.awayScore)||0)+' '+away,homeScore:Number(live.homeScore)||0,awayScore:Number(live.awayScore)||0,homeEventCount:homeEvents.length,awayEventCount:awayEvents.length,possessionHome:pt?Math.round(ph/pt*100):50,possessionAway:pt?Math.round(pa/pt*100):50,momentumHome:mh,momentumAway:ma,shots:events.filter(e=>e.type==='Shot').length,shotsOnTarget:events.filter(e=>e.type==='Shot on target').length,fouls:events.filter(e=>e.type==='Foul').length,freeKicks:events.filter(e=>e.type==='Free kick').length,goalKicks:events.filter(e=>e.type==='Goal-kick').length,corners:events.filter(e=>e.type==='Corner').length,offsides:events.filter(e=>e.type==='Offside').length,injuries:events.filter(e=>e.type==='Injury').length,penalties:events.filter(e=>e.type==='Penalty').length,reviews:events.filter(e=>e.type==='VAR / Review').length,events:events.length,officialRecordReady:true,generatedAt:Date.now(),generatedBy:actor?.userId||'system'};",
    "  const reports=(await db.list<RecordShape>('match_reports',{limit:5000})).items;const oldReport=reports.find(r=>String(r.fixtureId||'')===fixtureId);if(oldReport?.id)await db.update('match_reports',[{id:String(oldReport.id),record:{...oldReport,...report}}]);else await db.add('match_reports',[report]);",
    "  const readiness=(await db.list<RecordShape>('matchday_readiness',{limit:5000})).items.find(r=>String(r.fixtureId||'')===fixtureId);if(readiness?.id)await db.update('matchday_readiness',[{id:String(readiness.id),record:{...readiness,resultReady:true,updatedAt:Date.now()}}]);else await db.add('matchday_readiness',[{fixtureId,venueReady:true,officialsReady:false,teamSheetReady:sheets.length>0,resultReady:true,postMatchSignedOff:false,notes:'Auto-updated after full time.',updatedAt:Date.now()}]);",
    "  const fixtures=(await db.list<RecordShape>('fixtures',{limit:5000})).items, teams=(await db.list<RecordShape>('teams',{limit:5000})).items;const agg=new Map<string,{played:number;won:number;drawn:number;lost:number;gf:number;ga:number;pts:number}>();const t=(n:string)=>{const k=String(n||'').trim();if(!agg.has(k))agg.set(k,{played:0,won:0,drawn:0,lost:0,gf:0,ga:0,pts:0});return agg.get(k)!;};",
    "  for(const fx of fixtures){if(String(fx.status||'')!=='completed')continue;const h=String(fx.home||'').trim(),a=String(fx.away||'').trim(),hs=Number(fx.homeScore),as=Number(fx.awayScore);if(!Number.isFinite(hs)||!Number.isFinite(as))continue;const ht=t(h),at=t(a);ht.played++;at.played++;ht.gf+=hs;ht.ga+=as;at.gf+=as;at.ga+=hs;if(hs>as){ht.won++;ht.pts+=3;at.lost++;}else if(as>hs){at.won++;at.pts+=3;ht.lost++;}else{ht.drawn++;at.drawn++;ht.pts++;at.pts++;}}",
    "  for(const team of teams){const a=agg.get(String(team.name||'').trim());if(team.id&&a)await db.update('teams',[{id:String(team.id),record:{...team,...a}}]);}",
    "  const comms=(await db.list<RecordShape>('communications',{limit:5000})).items;const title=home+' '+(Number(live.homeScore)||0)+'-'+(Number(live.awayScore)||0)+' '+away;const existing=comms.find(c=>String(c.linkedType||'')==='fixture-result'&&String(c.linkedId||'')===fixtureId);const publication={title:'Full-time result',message:title+' · Official match record prepared.',audience:'Supporters',type:'Match Result',priority:'Normal',status:'Published',createdAt:Date.now(),publishedAt:Date.now(),linkedType:'fixture-result',linkedId:fixtureId};if(existing?.id)await db.update('communications',[{id:String(existing.id),record:{...existing,...publication}}]);else await db.add('communications',[publication]);",
    '  await syncFixtureFromLiveMatch(fixtureId);',
    '}',
  ].join('\n');

  api = api.slice(0, exportIndex) + helper + '\n// PITCHLINE_AUTO_FINISH_WORKFLOW\n' + api.slice(exportIndex);

  const handlerClose = "  try { await handler(routeRequest, response); }\n  catch (error) { console.error('Pitchline backend error', { requestId: reqId, error }); if (!response.writableEnded) send(response, 500, { error: error instanceof Error ? error.message : 'Backend request failed.', requestId: reqId }, reqId); }";
  const hook = handlerClose + "\n  if (response.statusCode < 400 && request.method === 'POST' && pathname === '/api/live-match/finish') { try { await finalizeMatchWorkflow(String(requestBody.fixtureId || '').trim(), actor || undefined); } catch (workflowError) { console.error('Pitchline automatic finish workflow failed', { requestId:reqId, fixtureId:String(requestBody.fixtureId||'').trim(), error:workflowError }); } }";
  if (api.includes(handlerClose)) api = api.replace(handlerClose, hook);
}

fs.writeFileSync(apiPath, api);
console.log('Pitchline workflows: player incident validation plus automatic finish intelligence, readiness completion, standings refresh and supporter result publication.');
