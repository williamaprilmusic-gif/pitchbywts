import fs from 'node:fs';

const path = 'backend/index.ts';
let source = fs.readFileSync(path, 'utf8');

const protectedGetRoutes = [
  '/api/team-sheets',
  '/api/appointments',
  '/api/performance',
  '/api/venue-availability',
  '/api/scheduling/conflicts',
  '/api/fixture-change-log',
  '/api/matchday-command',
  '/api/official-automation-summary',
  '/api/player-registry',
  '/api/club-applications',
  '/api/league-identity',
  '/api/club-staff',
  '/api/performance-summary',
  '/api/competition-summary',
  '/api/control-tower',
  '/api/automation',
  '/api/predictive-operations',
  '/api/member-portal',
  '/api/notification-summary',
];

for (const route of protectedGetRoutes) {
  const pattern = new RegExp(`('GET ${route}':\\[)(?!requireAuth\\(\\))`);
  source = source.replace(pattern, `$1requireAuth(),`);
}

source = source.replace(
  /('POST \/api\/subscriptions':)\[async/g,
  "$1[requireAuth(),async"
);

// Public live reports must expose only supporter-safe match information, not player/guardian/discipline internals.
const reportOld = /return json\(\{generatedAt:Date\.now\(\),fixture,finalScore:\{home:live\.homeScore,away:live\.awayScore\},status:live\.status,verified:Boolean\(verification\),verification,teamSheets:teamSheets\.filter\(s=>s\.fixtureId===params\.fixtureId\),players:players\.filter\(p=>p\.team===fixture\.home\|\|p\.team===fixture\.away\),events,discipline:discipline\.filter\(d=>d\.fixtureId===params\.fixtureId\),performance:performance\.filter\(p=>p\.fixtureId===params\.fixtureId\)\}\)/;
const reportNew = "return json({generatedAt:Date.now(),fixture:{id:fixture.id,home:fixture.home,away:fixture.away,date:fixture.date,time:fixture.time,venue:fixture.venue,status:fixture.status,matchdayStatus:fixture.matchdayStatus},finalScore:{home:live.homeScore,away:live.awayScore},status:live.status,verified:Boolean(verification),verifiedAt:verification?.verifiedAt,events:events.map(e=>({id:e.id,fixtureId:e.fixtureId,type:e.type,minute:e.minute,clockSeconds:e.clockSeconds,team:e.team,player:e.player,createdAt:e.createdAt}))})";
if (reportOld.test(source)) source = source.replace(reportOld, reportNew);

// Match start: prevent accidental starts before explicit matchday confirmation when that state exists.
const startGuard = "if(fixture.status==='completed')return error('Completed fixtures cannot be started',409);";
if (source.includes(startGuard) && !source.includes("fixture.matchdayStatus&&fixture.matchdayStatus!=='Confirmed'")) {
  source = source.replace(startGuard, `${startGuard}if(fixture.matchdayStatus&&fixture.matchdayStatus!=='Confirmed')return error('Matchday must be confirmed before the match can start',409);`);
}

// Live-event input validation: reject NaN/negative timestamps rather than silently coercing malformed input.
const eventValidationMarker = "const valid=matchRuleProfile(ruleAge).allowedEvents;if(!fixtureId||!valid.includes(type))return error(`fixtureId and an event allowed for ${ruleAge} are required`,400);";
if (source.includes(eventValidationMarker) && !source.includes('Number.isFinite(Number(input.minute))')) {
  source = source.replace(eventValidationMarker, `${eventValidationMarker}if(input.minute!==undefined&&!Number.isFinite(Number(input.minute)))return error('minute must be a finite number',400);if(input.clockSeconds!==undefined&&!Number.isFinite(Number(input.clockSeconds)))return error('clockSeconds must be a finite number',400);if(Number(input.minute||0)<0||Number(input.clockSeconds||0)<0)return error('Event time values cannot be negative',400);`);
}

// Matchday status changes should never globally recalculate unrelated competition tables.
source = source.replace(
  "if(matchdayStatus==='Full time')await recalcStandings();",
  "if(matchdayStatus==='Full time')await recalcStandings(String(next.competitionId||fixture.competitionId||'')||undefined);"
);

// Direct fixture edits should recalculate only the edited fixture's competition.
source = source.replace(
  "await notify('fixtures','league',out);await recalcStandings();return json({...next,id:params.id})",
  "await notify('fixtures','league',out);await recalcStandings(String(next.competitionId||old.competitionId||'')||undefined);return json({...next,id:params.id})"
);

fs.writeFileSync(path, source);
console.log('Applied Pitchline security/live hardening patch.');
