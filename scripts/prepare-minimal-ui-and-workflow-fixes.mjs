import fs from 'node:fs';

const backendPath = 'backend/index.ts';
let backend = fs.readFileSync(backendPath, 'utf8');

// Match operations shown to managers/clubs must use the same role model as the frontend.
const liveRoutes = [
  '/api/live-match/start',
  '/api/live-match/pause',
  '/api/live-match/resume',
  '/api/live-match/finish',
  '/api/live-match/events-v2',
  '/api/live-match/events',
  '/api/live-match/undo',
];
for (const route of liveRoutes) {
  const pattern = new RegExp(`('POST ${route}':)\\[requireAuth\\(\\),requireLfaAdmin\\(\\),`);
  backend = backend.replace(pattern, `$1[requireAuth(),requireAnyRole(['LFA Admin','Manager','Club']),scopedFixtureAccess(async(ctx)=>String((ctx.body as {fixtureId?:string})?.fixtureId||'')),`);
}

// Invoice status must follow the real current date, not a hard-coded date.
const invoiceOld = "function invoiceStatus(dueDate:string,status:'Due'|'Paid'|'Overdue'='Due'):'Due'|'Paid'|'Overdue'{if(status==='Paid')return 'Paid';return dueDate<'2026-09-13'?'Overdue':'Due';}";
const invoiceNew = "function invoiceStatus(dueDate:string,status:'Due'|'Paid'|'Overdue'='Due'):'Due'|'Paid'|'Overdue'{if(status==='Paid')return 'Paid';const today=new Date().toISOString().slice(0,10);return dueDate<today?'Overdue':'Due';}";
backend = backend.replace(invoiceOld, invoiceNew);

// Persist the factual safeguarding case note; the previous workflow validated it but discarded it.
const caseMarker = "await db.add('safeguarding_cases',[{playerId,team:player.team,clubId:player.clubId,category:String(input.category||'Safeguarding concern'),severity,status:'Open',ownerRole:assignment.role,createdAt:now,updatedAt:now}]);";
const caseReplacement = "await db.add('safeguarding_cases',[{playerId,team:player.team,clubId:player.clubId,category:String(input.category||'Safeguarding concern'),severity,status:'Open',ownerRole:assignment.role,note,createdAt:now,updatedAt:now}]);";
if (backend.includes(caseMarker)) backend = backend.replace(caseMarker, caseReplacement);

fs.writeFileSync(backendPath, backend);

const livePath = 'src/LiveMatchCentre.tsx';
let live = fs.readFileSync(livePath, 'utf8');

live = live.replace(
  "type LiveEvent = { id: string; fixtureId: string; type: string; minute: number; clockSeconds: number; team?: string; player?: string; relatedPlayer?: string; playerOffRef?: string; playerOnRef?: string; createdAt: number; createdBy?: string };",
  "type LiveEvent = { id: string; fixtureId: string; type: string; minute: number; clockSeconds: number; team?: string; player?: string; relatedPlayer?: string; assistRef?: string; playerOffRef?: string; playerOnRef?: string; createdAt: number; createdBy?: string };"
);
live = live.replace(
  "type PendingEvent = { fixtureId: string; type: string; team?: string; player?: string; minute: number; clockSeconds: number; playerOffRef?: string; playerOnRef?: string };",
  "type PendingEvent = { fixtureId: string; type: string; team?: string; player?: string; assistRef?: string; minute: number; clockSeconds: number; playerOffRef?: string; playerOnRef?: string };"
);
live = live.replace("  const [quickPlayer, setQuickPlayer] = useState('');\n", "  const [quickPlayer, setQuickPlayer] = useState('');\n  const [quickAssist, setQuickAssist] = useState('');\n");
live = live.replace("    setQuickPlayer('');\n    setQuickOff('');", "    setQuickPlayer('');\n    setQuickAssist('');\n    setQuickOff('');");
live = live.replace("    setQuickPlayer('');\n    setQuickOff('');\n    setQuickOn('');\n    setQuickTeam", "    setQuickPlayer('');\n    setQuickAssist('');\n    setQuickOff('');\n    setQuickOn('');\n    setQuickTeam");
live = live.replace(
  "    if (quickType === 'Substitution' && (!quickTeam || !quickOff || !quickOn || quickOff === quickOn)) {",
  "    if (quickType === 'Goal' && quickAssist && quickAssist === quickPlayer) {\n      setNotice('Assist must be a different player.');\n      return;\n    }\n    if (quickType === 'Substitution' && (!quickTeam || !quickOff || !quickOn || quickOff === quickOn)) {"
);
live = live.replace(
  "      player: quickPlayer || undefined,\n      minute,",
  "      player: quickPlayer || undefined,\n      assistRef: quickType === 'Goal' ? quickAssist || undefined : undefined,\n      minute,"
);

// Only genuine network failures should enter the offline queue. Validation/auth/conflict responses must surface immediately.
live = live.replace(
  "    } catch {\n      if (queueKey) {",
  "    } catch (error) {\n      const failure = error as Error & { status?: number; code?: string; requestId?: string };\n      const shouldQueue = Boolean(queueKey) && !(typeof failure.status === 'number' && failure.status > 0);\n      if (shouldQueue) {"
);
live = live.replace(
  "      } else {\n        setNotice('Could not record the event.');\n      }\n    } finally {",
  "      } else {\n        const detail = [failure.message, failure.code ? `code: ${failure.code}` : '', failure.requestId ? `request: ${failure.requestId}` : ''].filter(Boolean).join(' · ');\n        setNotice(detail || 'Could not record the event.');\n      }\n    } finally {"
);

const scorerUiOld = "{['Goal', 'Yellow card', 'Red card'].includes(quickType) && <><span className='step-label'>2 · PLAYER / GOALSCORER</span>{quickPlayers.length ? <div className='player-tap-grid'>{quickPlayers.map((player) => <button type='button' key={player.memberRef} className={`player-tap ${quickPlayer === player.memberRef ? 'selected' : ''}`} onClick={() => setQuickPlayer(player.memberRef)}><b>{player.number}</b><span>{player.name}</span></button>)}</div> : <div className='empty-state'><h3>No registered players found for {quickTeam || 'this team'}</h3><p>Register the team players first, then return to the live match.</p></div>}</>}";
const scorerUiNew = "{['Goal', 'Yellow card', 'Red card'].includes(quickType) && <><span className='step-label'>2 · PLAYER / GOALSCORER</span>{quickPlayers.length ? <div className='player-tap-grid'>{quickPlayers.map((player) => <button type='button' key={player.memberRef} className={`player-tap ${quickPlayer === player.memberRef ? 'selected' : ''}`} onClick={() => setQuickPlayer(player.memberRef)}><b>{player.number}</b><span>{player.name}</span></button>)}</div> : <div className='empty-state'><h3>No registered players found for {quickTeam || 'this team'}</h3><p>Register the team players first, then return to the live match.</p></div>}{quickType === 'Goal' && quickPlayers.length > 1 && <><span className='step-label'>3 · ASSIST (OPTIONAL)</span><div className='player-tap-grid'>{quickPlayers.filter((player) => player.memberRef !== quickPlayer).map((player) => <button type='button' key={`assist-${player.memberRef}`} className={`player-tap ${quickAssist === player.memberRef ? 'selected' : ''}`} onClick={() => setQuickAssist(player.memberRef)}><b>{player.number}</b><span>{player.name}</span></button>)}</div><small className='muted'>Optional. Leave blank for an unassisted goal.</small></>}</>}";
if (!live.includes(scorerUiOld)) {
  if (!live.includes("step-label'>2 · PLAYER / GOALSCORER")) throw new Error('Expected scorer UI anchor not found');
} else {
  live = live.replace(scorerUiOld, scorerUiNew);
}

const timelineOld = "{event.type}{event.player ? ` · ${event.player}` : ''}</b><small>{event.team || 'Official'}{event.playerOffRef ? ` · OFF ${event.playerOffRef}` : ''}{event.playerOnRef ? ` · ON ${event.playerOnRef}` : ''}</small>";
const timelineNew = "{event.type}{event.player ? ` · ${event.player}` : ''}</b><small>{event.team || 'Official'}{event.assistRef ? ` · Assist ${event.assistRef}` : ''}{event.playerOffRef ? ` · OFF ${event.playerOffRef}` : ''}{event.playerOnRef ? ` · ON ${event.playerOnRef}` : ''}</small>";
live = live.replace(timelineOld, timelineNew);

fs.writeFileSync(livePath, live);

// Keep Matchday Command focused on scheduling/confirmation; live state belongs to Live Match.
const matchdayPath = 'src/MatchdayCommandCentre.tsx';
if (fs.existsSync(matchdayPath)) {
  let matchday = fs.readFileSync(matchdayPath, 'utf8');
  matchday = matchday.replace("const statuses=['Planned','Confirmed','Live','Half time','Full time'];", "const statuses=['Planned','Confirmed'];");
  fs.writeFileSync(matchdayPath, matchday);
}

console.log('Applied minimal professional UI and workflow consistency fixes.');
