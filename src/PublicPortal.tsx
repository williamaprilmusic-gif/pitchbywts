import React, { useMemo, useState } from 'react';
import { CalendarDays, Megaphone, Share2, Trophy, Users } from 'lucide-react';

type Fixture={id:string;home:string;away:string;date:string;time:string;venue:string;status:string;homeScore?:number;awayScore?:number};
type Team={id:string;name:string;ageGroup:string;played:number;won:number;drawn:number;lost:number;gf:number;ga:number;pts:number};
type Player={id:string;name:string;team:string;position:string;number:number};
type Communication={id:string;title:string;message:string;audience:string;priority:string;status:string;createdAt:number};

export default function PublicPortal({fixtures,teams,players,communications}:{fixtures:Fixture[];teams:Team[];players:Player[];communications:Communication[]}){
  const [age,setAge]=useState('U14');
  const [shared,setShared]=useState('');
  const publicTeams=useMemo(()=>teams.filter(t=>t.ageGroup===age).sort((a,b)=>b.pts-a.pts||((b.gf-b.ga)-(a.gf-a.ga))),[teams,age]);
  const upcoming=fixtures.filter(f=>f.status==='upcoming').slice(0,5);
  const results=fixtures.filter(f=>f.status!=='upcoming').slice(0,5);
  const publicPlayers=players.filter(p=>p.team.includes(age)).slice(0,8);
  const published=communications.filter(c=>c.status==='Published').slice(0,6);
  const share=async(id:string)=>{const url=`${window.location.origin}${window.location.pathname}#public-match-${id}`;try{await navigator.clipboard.writeText(url);setShared('Match link copied.')}catch{setShared(url)}};
  return <div className='public-portal'>
    <div className='public-hero'><div><p className='eyebrow'>PUBLIC LEAGUE CENTRE</p><h1>Community football, live and open.</h1><p className='muted'>Fixtures, results, standings, teams, player statistics and league announcements in one public matchday experience.</p></div><div className='public-season'><Trophy size={18}/><span>2026 Community League</span></div></div>
    <div className='public-tabs'>{['U8','U10','U12','U14','U16','U18'].map(a=><button key={a} className={age===a?'active':''} onClick={()=>setAge(a)}>{a}</button>)}</div>
    {shared&&<div className='public-notice'>{shared}</div>}
    <div className='public-grid'>
      <section className='card'><div className='card-head'><div><span className='label'>UPCOMING</span><h2>Next fixtures</h2></div><CalendarDays size={19}/></div>{upcoming.length?upcoming.map(f=><div className='public-fixture' key={f.id}><div><b>{f.home}</b><span>vs</span><b>{f.away}</b></div><small>{f.date} · {f.time}<br/>{f.venue}</small><button className='ghost small' onClick={()=>share(f.id)} title='Share match'><Share2 size={14}/></button></div>):<p className='muted'>No upcoming fixtures.</p>}</section>
      <section className='card'><div className='card-head'><div><span className='label'>RESULTS</span><h2>Recent results</h2></div><Trophy size={19}/></div>{results.length?results.map(f=><div className='public-result' key={f.id}><div><b>{f.home}</b><span>{f.away}</span></div><strong>{f.homeScore ?? '—'} : {f.awayScore ?? '—'}</strong><small>{f.date}</small></div>):<p className='muted'>No completed results yet.</p>}</section>
    </div>
    <div className='public-grid'>
      <section className='card'><div className='card-head'><div><span className='label'>STANDINGS</span><h2>{age} league table</h2></div><Trophy size={19}/></div>{publicTeams.length?publicTeams.map((t,i)=><div className='public-table-row' key={t.id}><span>{i+1}</span><b>{t.name}</b><small>{t.played}P · {t.won}W · {t.drawn}D · {t.lost}L</small><strong>{t.pts}</strong></div>):<p className='muted'>No teams registered in this age group.</p>}</section>
      <section className='card'><div className='card-head'><div><span className='label'>PLAYER WATCH</span><h2>{age} players</h2></div><Users size={19}/></div>{publicPlayers.length?publicPlayers.map(p=><div className='public-player' key={p.id}><span>{p.number}</span><div><b>{p.name}</b><small>{p.team} · {p.position}</small></div><strong>Profile</strong></div>):<p className='muted'>No public player profiles in this age group.</p>}</section>
    </div>
    <section className='card'><div className='card-head'><div><span className='label'>LEAGUE NEWS</span><h2>Announcements</h2></div><Megaphone size={19}/></div>{published.map(c=><div className='public-news' key={c.id}><div><b>{c.title}</b><p>{c.message}</p></div><span className={`status ${c.priority==='Urgent'?'amber':c.priority==='Important'?'blue':'green'}`}>{c.priority}</span></div>)}{!published.length&&<p className='muted'>No public announcements.</p>}</section>
  </div>;
}
