import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'backend', 'index.ts');
let s = fs.readFileSync(file, 'utf8');

const importAnchor = "import { router, json, error, db, ws, requireAuth, type RouterMiddleware } from '../server/appdeployCompat';";
const importReplacement = `${importAnchor}\nimport { syncFixtureFromLive, upsertTeamSheet, liveEventAlreadyRecorded } from '../server/matchIntegrity';`;
if (!s.includes(importReplacement)) {
  if (!s.includes(importAnchor)) throw new Error('backend import anchor not found');
  s = s.replace(importAnchor, importReplacement);
}

const startNeedle = "await db.add('live_events',[{fixtureId,type:'Kick-off',minute:1,clockSeconds:0,createdAt:now}]);";
const startReplacement = `${startNeedle} await syncFixtureFromLive(fixtureId, next);`;
if (!s.includes(startReplacement)) {
  if ((s.match(new RegExp(escape(startNeedle), 'g')) || []).length !== 1) throw new Error('start event anchor count mismatch');
  s = s.replace(startNeedle, startReplacement);
}

const teamSheetOld = "const [id]=await db.add('team_sheets',[record]);if(!id)return error('Could not save team sheet',500);const out=await listTable('team_sheets');";
const teamSheetNew = "const saved=await upsertTeamSheet(record);if(!saved.id)return error('Could not save team sheet',500);const out=await listTable('team_sheets');";
if (!s.includes(teamSheetNew)) {
  if ((s.match(new RegExp(escape(teamSheetOld), 'g')) || []).length !== 1) throw new Error('team sheet anchor count mismatch');
  s = s.replace(teamSheetOld, teamSheetNew);
}
const teamSheetReturn = "return json({...record,id})}],\n  'POST /api/performance'";
const teamSheetReturnNew = "return json({...record,id:saved.id})}],\n  'POST /api/performance'";
if (s.includes(teamSheetReturn)) s = s.replace(teamSheetReturn, teamSheetReturnNew);

const eventAnchor = "const locked=(await listTable<Record<string,unknown>>('live_match_verifications')).some(v=>String(v.fixtureId)===fixtureId);if(locked)return error('Verified matches are locked',409);";
const eventReplacement = `${eventAnchor} const duplicate=await liveEventAlreadyRecorded(fixtureId,input);if(duplicate)return json(duplicate);`;
if (!s.includes(eventReplacement)) {
  if ((s.match(new RegExp(escape(eventAnchor), 'g')) || []).length !== 1) throw new Error('events-v2 anchor count mismatch');
  s = s.replace(eventAnchor, eventReplacement);
}

fs.writeFileSync(file, s);
console.log('Match integrity source repairs applied.');

function escape(value){return value.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&');}
