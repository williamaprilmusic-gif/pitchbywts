import fs from 'node:fs';

const app=fs.readFileSync('src/App.tsx','utf8');
const backend=fs.readFileSync('backend/index.ts','utf8');
const gateway=fs.readFileSync('server/apiEntrypoint.ts','utf8');
const live=fs.readFileSync('src/LiveMatchCentre.tsx','utf8');
const failures=[];
const check=(label,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${label}`);if(!ok)failures.push(label);};

check('workspace consolidation marker exists',app.includes('PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED'));
check('role navigation groups exist',app.includes('type RoleNavGroup=')&&app.includes('const roleNavGroups'));
check('flat navigation renderer removed',!app.includes('<nav>{roleItems.filter(item=>item.roles.includes(effectiveRole)).map'));
check('navigation count is bounded',new Set([...app.matchAll(/\\{tab:'([^']+)'/g)].map(m=>m[1])).size<=25);
check('six role workspace groups exist',['football','team','club','league','governance','executive'].every(id=>app.includes("id:'"+id+"'")));
check('collapsed workspace state exists',app.includes('openNavGroups'));
check('live operators remain authorized',backend.includes('isMatchOperator')||gateway.includes('isMatchOperator'));
check('live event duplicate protection remains',backend.includes('findDuplicateLiveEvent')||gateway.includes('findDuplicateLiveEvent'));