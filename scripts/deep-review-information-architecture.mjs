import fs from 'node:fs';
const app = fs.readFileSync('src/App.tsx','utf8');
const backend = fs.readFileSync('backend/index.ts','utf8');
const gateway = fs.readFileSync('server/apiEntrypoint.ts','utf8');
const live = fs.readFileSync('src/LiveMatchCentre.tsx','utf8');
const failures = [];
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures.push(label); };

const canonicalTabs=['home','fixtures','table','public','live-match','portal','squad','matchday','performance','club','club-management','player-family-system','teams','finance','communications','reports','registration','officials','discipline','scheduling','competition-operations','control-tower','matchday-command','compliance-governance','executive-command','access-management'];
const navBlock=app.match(/const roleItems:Array<[^>]+>= \[(.*?)\n\];/s)?.[1]||'';
const visibleTabs=[...navBlock.matchAll(/\{tab:'([^']+)'/g)].map(m=>m[1]);
check('canonical workspace marker exists', app.includes('WTS_WORKSPACE_CONSOLIDATION_APPLIED'));
check('visible workspace count is bounded', visibleTabs.length<=25);
check('Supporter workspace surface exists', ['home','fixtures','table','public','live-match','portal'].every(tab=>visibleTabs.includes(tab)));
check('Manager workspace surface exists', ['matchday','squad','player-family-system','performance'].every(tab=>visibleTabs.includes(tab)));
check('Club workspace surface exists', ['club','club-management','teams','player-family-system','finance','communications','reports'].every(tab=>visibleTabs.includes(tab)));
check('LFA operations surface exists', ['registration','officials','discipline','scheduling','competition-operations','control-tower','matchday-command'].every(tab=>visibleTabs.includes(tab)));
check('LFA governance surface exists', ['compliance-governance','access-management'].every(tab=>visibleTabs.includes(tab)));