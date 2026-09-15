import fs from 'node:fs';

const file = 'backend/index.ts';
let source = fs.readFileSync(file, 'utf8');

const functionPattern = /async function recalcStandings\(\)\{[\s\S]*?\}\nexport const handler=/;
const replacement = `async function recalcStandings(competitionId?: string){
  const fixtures=await listTable<Fixture&{id:string}>('fixtures');
  const teams=await listTable<Team&{id:string}>('teams');
  const scopedFixtures=competitionId ? fixtures.filter(f=>String(f.competitionId||'')===competitionId) : fixtures;
  const scopedTeams=competitionId ? teams.filter(t=>String((t as Record<string,unknown>).competitionId||'')===competitionId) : teams;
  const calc=new Map<string,Team&{id:string}>();
  for(const t of scopedTeams)calc.set(t.name,{...t,played:0,won:0,drawn:0,lost:0,gf:0,ga:0,pts:0});
  for(const f of scopedFixtures){
    if(f.status!=='completed'||typeof f.homeScore!=='number'||typeof f.awayScore!=='number')continue;
    const h=calc.get(f.home),a=calc.get(f.away);if(!h||!a)continue;
    h.played++;a.played++;h.gf+=f.homeScore;h.ga+=f.awayScore;a.gf+=f.awayScore;a.ga+=f.homeScore;
    if(f.homeScore>f.awayScore){h.won++;h.pts+=3;a.lost++;}
    else if(f.homeScore<f.awayScore){a.won++;a.pts+=3;h.lost++;}
    else{h.drawn++;a.drawn++;h.pts++;a.pts++;}
  }
  for(const t of calc.values())await db.update('teams',[{id:t.id,record:{name:t.name,ageGroup:t.ageGroup,played:t.played,won:t.won,drawn:t.drawn,lost:t.lost,gf:t.gf,ga:t.ga,pts:t.pts,competitionId:competitionId||undefined}}]);
  const out=await listTable('teams');await notify('teams','league',out);return out;
}
export const handler=`;

if (!functionPattern.test(source)) {
  throw new Error('Could not locate recalcStandings() for competition-scoped patch.');
}
source = source.replace(functionPattern, replacement);
source = source.replace(/if\(okFixture\[0\]\)await recalcStandings\(\)/g, "if(okFixture[0])await recalcStandings(String(fixture.competitionId||'')||undefined)");
source = source.replace(/if\(matchdayStatus==='Full time'\)await recalcStandings\(\)/g, "if(matchdayStatus==='Full time')await recalcStandings(String(fixture.competitionId||'')||undefined)");
source = source.replace(/await recalcStandings\(\);return json\(\{\.\.\.next,id:params\.id\}\)/g, "await recalcStandings(String(next.competitionId||old.competitionId||'')||undefined);return json({...next,id:params.id})");
fs.writeFileSync(file, source);
console.log('Applied competition-scoped standings patch to backend/index.ts');
