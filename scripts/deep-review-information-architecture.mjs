import fs from 'node:fs';
const app = fs.readFileSync('src/App.tsx','utf8');
const backend = fs.readFileSync('backend/index.ts','utf8');
const gateway = fs.readFileSync('server/apiEntrypoint.ts','utf8');
const live = fs.readFileSync('src/LiveMatchCentre.tsx','utf8');
const failures = [];
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures.push(label); };

const canonicalTabs=['home','fixtures','table','public','live-match','portal','squad','matchday','performance','club','club-management','player-family-system','teams','finance','communications','reports','registration','officials','discipline','scheduling','competition-operations','control-tower','matchday-command','compliance-governance','executive-command','access-management'];
const navBlock=app.match(/const roleItems:Array<[^>]+>= \[(.*?)\n\];/s)?.[1]||'';
const visibleTabs=[...navBlock.matchAll(/\\{tab:'([^']+)'/g)].map(m=>m[1]);
check('canonical workspace marker exists', app.includes('WTS_WORKSPACE_CONSOLIDATION_APPLIED'));
check('visible workspace count is bounded', visibleTabs.length<=25);
check('Supporter workspace surface exists', ['home','fixtures','table','public','live-match','portal'].every(tab=>visibleTabs.includes(tab)));
check('Manager workspace surface exists', ['matchday','squad','player-family-system','performance'].every(tab=>visibleTabs.includes(tab)));
check('Club workspace surface exists', ['club','club-management','teams','player-family-system','finance','communications','reports'].every(tab=>visibleTabs.includes(tab)));
check('LFA operations surface exists', ['registration','officials','discipline','scheduling','competition-operations','control-tower','matchday-command'].every(tab=>visibleTabs.includes(tab)));
check('LFA governance surface exists', ['compliance-governance','access-management'].every(tab=>visibleTabs.includes(tab)));
check('LFA executive surface exists', ['executive-command'].every(tab=>visibleTabs.includes(tab)));
check('all canonical route tabs are represented', canonicalTabs.every(tab=>visibleTabs.includes(tab)));
check('all original route tabs remain represented', ['home','fixtures','table','live-match','matchday','squad','player-family-system','performance','safeguarding-compliance','club-management','teams','player-registry','finance','communications','reports','league','officials','discipline','registration','operations','competition','scheduling','control-tower','matchday-command','automation','predictive','access-management','league-identity','compliance-governance','decision-intelligence','executive-command','workflow-automation','competition-portfolio','cross-competition','competition-operations'].every(tab => app.includes(`tab:'${tab}'`)));
check('live operators include Manager and Club roles', /\['LFA Admin','Manager','(?:Club|Club Manager)'\]/.test(backend) || backend.includes('isMatchOperator(user.userId)') || gateway.includes('isMatchOperator'));
check('live event route uses scoped operator access', (backend.includes("'/api/live-match/events-v2'") || gateway.includes("'/api/live-match/events-v2'")) && (backend.includes('scopedFixtureAccess') || gateway.includes('scopedFixtureAccess')));
check('live event duplicate detection remains', gateway.includes('findDuplicateLiveEvent') || backend.includes('findDuplicateLiveEvent'));
check('live match concurrency lock remains', gateway.includes('acquireLiveLock') || backend.includes('acquireLiveLock'));
check('goal assist reaches live event payload', live.includes('assistRef'));
check('invalid live events are not queued as offline work', (live.includes('shouldQueue') && live.includes('failure.status')) || (live.includes('live_match_busy') && live.includes('queueKey')) || /catch \(error\)[\s\S]{0,1600}queue\.push\(payload\)/.test(live));
check('public live report is supporter-safe', (backend.includes('verifiedAt:verification?.verifiedAt') || gateway.includes('verifiedAt:verification?.verifiedAt')) && !backend.includes('discipline:discipline.filter(d=>d.fixtureId===params.fixtureId)'));
check('standings recalculation is competition-scoped', /recalcStandings\((?:String\([^)]*competitionId[^)]*\)|competitionId|[^)]*competitionId[^)]*)\)/.test(backend));
check('safeguarding case notes persist', /safeguarding_cases[\s\S]*note/.test(backend) && backend.includes('ownerRole:assignment.role'));
check('invoice overdue status is date-aware', backend.includes('new Date().toISOString().slice(0,10)'));
check('competition bracket team validation resolves registered teams', backend.includes('registeredTeams.find') || backend.includes('registeredTeams') && backend.includes('team.name'));
check('competition request key is stable', fs.existsSync('scripts/prepare-competition-platform-fixes.mjs') && fs.readFileSync('scripts/prepare-competition-platform-fixes.mjs','utf8').includes('stableBody=JSON.stringify'));
check('obsolete goal scorer workflow removed', !fs.existsSync('.github/workflows/apply-goal-scorer-fix.yml'));

if (failures.length) { console.error(`INFORMATION ARCHITECTURE AUDIT: FAIL (${failures.length})`); console.error(failures.join('\n')); process.exit(1); }
console.log('INFORMATION ARCHITECTURE AUDIT: PASS');