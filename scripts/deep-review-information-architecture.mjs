import fs from 'node:fs';
const app = fs.readFileSync('src/App.tsx','utf8');
const backend = fs.readFileSync('backend/index.ts','utf8');
const gateway = fs.readFileSync('server/apiEntrypoint.ts','utf8');
const live = fs.readFileSync('src/LiveMatchCentre.tsx','utf8');
const failures = [];
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures.push(label); };

check('role-based navigation groups exist', app.includes('const roleNavGroups:RoleNavGroup[]='));
check('flat navigation renderer is removed', !app.includes("<nav>{roleItems.filter(item=>item.roles.includes(effectiveRole)).map"));
check('Supporter workspace exists', app.includes("id:'supporter-main'"));
check('Manager workspace exists', app.includes("id:'team'"));
check('Club workspace exists', app.includes("id:'club'"));
check('LFA operations workspace exists', app.includes("id:'lfa-operations'"));
check('LFA competition workspace exists', app.includes("id:'lfa-competition'"));
check('LFA governance workspace exists', app.includes("id:'lfa-people'"));
check('LFA intelligence workspace exists', app.includes("id:'lfa-intelligence'"));
check('collapsed navigation state exists', app.includes('openNavGroups'));
check('all original route tabs remain represented', ['home','fixtures','table','live-match','matchday','squad','player-family-system','performance','safeguarding-compliance','club-management','teams','player-registry','finance','communications','reports','league','officials','discipline','registration','operations','competition','scheduling','control-tower','matchday-command','automation','predictive','access-management','league-identity','compliance-governance','decision-intelligence','executive-command','workflow-automation','competition-portfolio','cross-competition','competition-operations'].every(tab => app.includes(`tab:'${tab}'`)));
check('live operators include Manager and Club roles', /\['LFA Admin','Manager','(?:Club|Club Manager)'\]/.test(backend) || backend.includes('isMatchOperator(user.userId)') || gateway.includes('isMatchOperator'));
check('live event route uses scoped operator access', (backend.includes("'/api/live-match/events-v2'") || gateway.includes("'/api/live-match/events-v2'")) && (backend.includes('scopedFixtureAccess') || gateway.includes('scopedFixtureAccess')));
check('live event duplicate detection remains', gateway.includes('findDuplicateLiveEvent') || backend.includes('findDuplicateLiveEvent'));
check('live match concurrency lock remains', gateway.includes('acquireLiveLock') || backend.includes('acquireLiveLock'));
check('goal assist reaches live event payload', live.includes('assistRef'));
check('invalid live events are not queued as offline work', live.includes('shouldQueue') && live.includes('failure.status'));
check('public live report is supporter-safe', (backend.includes('verifiedAt:verification?.verifiedAt') || gateway.includes('verifiedAt:verification?.verifiedAt')) && !backend.includes('discipline:discipline.filter(d=>d.fixtureId===params.fixtureId)'));
check('standings recalculation is competition-scoped', /recalcStandings\((?:String\([^)]*competitionId[^)]*\)|competitionId|[^)]*competitionId[^)]*)\)/.test(backend));
check('safeguarding case notes persist', /safeguarding_cases[\s\S]*note/.test(backend) && backend.includes('ownerRole:assignment.role'));
check('invoice overdue status is date-aware', backend.includes('new Date().toISOString().slice(0,10)'));
check('competition bracket team validation resolves registered teams', backend.includes('registeredTeams.find') || backend.includes('registeredTeams') && backend.includes('team.name'));
check('competition request key is stable', fs.existsSync('scripts/prepare-competition-platform-fixes.mjs') && fs.readFileSync('scripts/prepare-competition-platform-fixes.mjs','utf8').includes('stableBody=JSON.stringify'));
check('obsolete goal scorer workflow removed', !fs.existsSync('.github/workflows/apply-goal-scorer-fix.yml'));

if (failures.length) { console.error(`INFORMATION ARCHITECTURE AUDIT: FAIL (${failures.length})`); console.error(failures.join('\n')); process.exit(1); }
console.log('INFORMATION ARCHITECTURE AUDIT: PASS');
