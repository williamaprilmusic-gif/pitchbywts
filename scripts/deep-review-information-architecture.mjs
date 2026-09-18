import fs from 'node:fs';

const app=fs.readFileSync('src/App.tsx','utf8');
const backend=fs.readFileSync('backend/index.ts','utf8');
const gateway=fs.readFileSync('server/apiEntrypoint.ts','utf8');
const live=fs.readFileSync('src/LiveMatchCentre.tsx','utf8');
const failures=[];
const check=(label,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${label}`);if(!ok)failures.push(label);};

const canonicalTabs=['home','fixtures','table','live-match','squad','matchday','performance','player-family-system','club-management','teams','finance','communications','reports','registration','officials','discipline','scheduling','competition-operations','control-tower','matchday-command','compliance-governance','access-management','executive-command'];
const navTabs=[...app.matchAll(/\\{tab:'([^']+)'/g)].map(m=>m[1]);
check('workspace consolidation marker exists',app.includes('PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED'));
check('role navigation groups exist',app.includes('type RoleNavGroup=')&&app.includes('const roleNavGroups'));
check('flat navigation renderer removed',!app.includes('<nav>{roleItems.filter(item=>item.roles.includes(effectiveRole)).map'));
check('navigation count is bounded',new Set(navTabs).size<=25);
check('all canonical workspaces remain reachable',canonicalTabs.every(t=>navTabs.includes(t)));
check('collapsed workspace state exists',app.includes('openNavGroups'));
check('Manager workspace is represented',app.includes("id:'team'")&&app.includes("roles:['Manager']"));
check('Club workspace is represented',app.includes("id:'club'")&&app.includes("roles:['Club']"));
check('League workspace is represented',app.includes("id:'league'")&&app.includes("roles:['LFA Admin']"));
check('Governance workspace is represented',app.includes("id:'governance'")&&app.includes("roles:['LFA Admin']"));
check('Executive workspace is represented',app.includes("id:'executive'")&&app.includes("roles:['LFA Admin']"));
check('live operators remain authorized',backend.includes('isMatchOperator')||gateway.includes('isMatchOperator'));
check('live event duplicate protection remains',backend.includes('findDuplicateLiveEvent')||gateway.includes('findDuplicateLiveEvent'));
check('live concurrency lock remains',backend.includes('acquireLiveLock')||gateway.includes('acquireLiveLock'));
check('goal/assist payload support remains',live.includes('assistRef'));
check('standings remain competition-scoped',backend.includes('competitionId')&&backend.includes('recalcStandings'));
check('safeguarding persistence remains',backend.includes('safeguarding_cases'));
check('invoice date handling remains',backend.includes('new Date().toISOString().slice(0,10)'));
check('obsolete goal scorer workflow absent',!fs.existsSync('.github/workflows/apply-goal-scorer-fix.yml'));

if(failures.length){console.error(`INFORMATION ARCHITECTURE AUDIT: FAIL (${failures.length})`);console.error(failures.join('\n'));process.exit(1);}
console.log('INFORMATION ARCHITECTURE AUDIT: PASS');