import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Goal, Handshake, Megaphone, Share2, Star, Trophy, Users, X } from 'lucide-react';
import { api } from './platformClient';
import { rankTeams, RANKING_CRITERIA } from './standings';

type Fixture={id:string;home:string;away:string;date:string;time:string;venue:string;status:string;homeScore?:number;awayScore?:number};
type Team={id:string;name:string;ageGroup:string;played:number;won:number;drawn:number;lost:number;gf:number;ga:number;pts:number};
type Player={id:string;name:string;team:string;position:string;number:number};
type Communication={id:string;title:string;message:string;audience:string;priority:string;status:string;createdAt:number};
type StatLeader={ref:string;name:string;team:string;position:string;number:number;ageGroup:string;apps:number;minutes:number;goals:number;assists:number;motm:number;yellow:number;red:number;avgRating:number};
type FormRow={team:string;ageGroup:string;last5:Array<'W'|'D'|'L'>;recent:Array<{opponent:string;result:'W'|'D'|'L';score:string;date:string;home:boolean}>};
type Stats={leaders:{scorers:StatLeader[];assists:StatLeader[];motm:StatLeader[]};profiles:StatLeader[];form:FormRow[]};

const EMPTY_STATS:Stats={leaders:{scorers:[],assists:[],motm:[]},profiles:[],form:[]};

export default function PublicPortal({fixtures,teams,players,communications}:{fixtures:Fixture[];teams:Team[];players:Player[];communications:Communication[]}){
  const [age,setAge]=useState('U14');
  const [shared,setShared]=useState('');
  const [stats,setStats]=useState<Stats>(EMPTY_STATS);
  const [profile,setProfile]=useState<StatLeader|null>(null);
  useEffect(()=>{let live=true;api.get('/api/stats').then(r=>{if(live&&r.data)setStats({...EMPTY_STATS,...r.data,leaders:{...EMPTY_STATS.leaders,...(r.data.leaders||{})}})}).catch(()=>undefined);return()=>{live=false};},[]);
  const publicTeams=useMemo(()=>rankTeams(teams.filter(t=>t.ageGroup===age),fixtures),[teams,age,fixtures]);
  const upcoming=fixtures.filter(f=>f.status==='upcoming').slice(0,5);
  const results=fixtures.filter(f=>f.status!=='upcoming').slice(0,5);
  const publicPlayers=players.filter(p=>p.team.includes(age)).slice(0,8);
  const published=communications.filter(c=>c.status==='Published').slice(0,6);
  const scorers=stats.leaders.scorers.filter(s=>!s.ageGroup||s.ageGroup===age).slice(0,10);
  const assists=stats.leaders.assists.filter(s=>!s.ageGroup||s.ageGroup===age).slice(0,10);
  const motm=stats.leaders.motm.filter(s=>!s.ageGroup||s.ageGroup===age).slice(0,10);
  const formByTeam=useMemo(()=>{const m=new Map<string,FormRow>();for(const f of stats.form)m.set(f.team.toLowerCase(),f);return m;},[stats.form]);
  const profileFor=(name:string,team:string)=>stats.profiles.find(p=>p.name.toLowerCase()===name.toLowerCase()&&p.team.toLowerCase()===team.toLowerCase())||stats.profiles.find(p=>p.name.toLowerCase()===name.toLowerCase())||null;
  const share=async(id:string)=>{const url=`${window.location.origin}${window.location.pathname}#public-match-${id}`;try{await navigator.clipboard.writeText(url);setShared('Match link copied.')}catch{setShared(url)}};
  const hasLeaders=scorers.length>0||assists.length>0||motm.length>0;
  return <div className='public-portal'>
    <div className='public-hero'><div><p className='eyebrow'>PUBLIC LEAGUE CENTRE</p><h1>Community football, live and open.</h1><p className='muted'>Fixtures, results, standings, teams, player statistics and league announcements in one public matchday experience.</p></div><div className='public-season'><Trophy size={18}/><span>2026 Community League</span></div></div>
    <div className='calendar-cta'><CalendarDays size={16}/><span>Never miss a match — subscribe to the fixtures calendar in your phone.</span><a className='calendar-cta-btn' href={`webcal://${window.location.host}/api/calendar/fixtures.ics`}>Subscribe</a><a className='calendar-cta-btn ghost' href='/api/calendar/fixtures.ics'>Download .ics</a></div>
    <div className='public-tabs'>{['U8','U10','U12','U14','U16','U18'].map(a=><button key={a} className={age===a?'active':''} onClick={()=>setAge(a)}>{a}</button>)}</div>
    {shared&&<div className='public-notice'>{shared}</div>}
    <div className='public-grid'>
      <section className='card'><div className='card-head'><div><span className='label'>UPCOMING</span><h2>Next fixtures</h2></div><CalendarDays size={19}/></div>{upcoming.length?upcoming.map(f=><div className='public-fixture' key={f.id}><div><b>{f.home}</b><span>vs</span><b>{f.away}</b></div><small>{f.date} · {f.time}<br/>{f.venue}</small><button className='ghost small' onClick={()=>share(f.id)} title='Share match'><Share2 size={14}/></button></div>):<p className='muted'>No upcoming fixtures.</p>}</section>
      <section className='card'><div className='card-head'><div><span className='label'>RESULTS</span><h2>Recent results</h2></div><Trophy size={19}/></div>{results.length?results.map(f=><div className='public-result' key={f.id}><div><b>{f.home}</b><span>{f.away}</span></div><strong>{f.homeScore ?? '—'} : {f.awayScore ?? '—'}</strong><small>{f.date}</small></div>):<p className='muted'>No completed results yet.</p>}</section>
    </div>
    <div className='public-grid'>
      <section className='card'><div className='card-head'><div><span className='label'>STANDINGS</span><h2>{age} league table</h2></div><Trophy size={19}/></div>{publicTeams.length?publicTeams.map((t,i)=>{const form=formByTeam.get(t.name.toLowerCase());return <div className='public-table-row' key={t.id}><span>{i+1}</span><b>{t.name}</b><small>{t.played}P · {t.won}W · {t.drawn}D · {t.lost}L</small>{form&&form.last5.length?<span className='form-strip' title='Recent form (most recent last)'>{form.last5.map((r,k)=><i key={k} className={`form-badge ${r.toLowerCase()}`} aria-label={r==='W'?'Win':r==='D'?'Draw':'Loss'}>{r}</i>)}</span>:<span className='form-strip empty'>—</span>}<strong>{t.pts}</strong></div>}):<p className='muted'>No teams registered in this age group.</p>}{publicTeams.length>1&&<p className='muted table-note'>{RANKING_CRITERIA}</p>}</section>
      <section className='card'><div className='card-head'><div><span className='label'>PLAYER WATCH</span><h2>{age} players</h2></div><Users size={19}/></div>{publicPlayers.length?publicPlayers.map(p=>{const prof=profileFor(p.name,p.team);return <button className='public-player as-button' key={p.id} onClick={()=>prof&&setProfile(prof)} disabled={!prof}><span>{p.number}</span><div><b>{p.name}</b><small>{p.team} · {p.position}</small></div>{prof?<strong>{prof.goals}G · {prof.assists}A</strong>:<strong className='muted'>No data</strong>}</button>}):<p className='muted'>No public player profiles in this age group.</p>}</section>
    </div>
    {hasLeaders&&<div className='public-grid stat-leaders'>
      <section className='card'><div className='card-head'><div><span className='label'>GOLDEN BOOT</span><h2>{age} top scorers</h2></div><Goal size={19}/></div>{scorers.length?scorers.map((s,i)=><button className='leaderboard-row as-button' key={s.ref} onClick={()=>setProfile(s)}><span className={`rank ${i===0?'gold':''}`}>{i+1}</span><div><b>{s.name}</b><small>{s.team}</small></div><strong>{s.goals}</strong></button>):<p className='muted'>No goals recorded yet.</p>}</section>
      <section className='card'><div className='card-head'><div><span className='label'>PLAYMAKERS</span><h2>{age} top assists</h2></div><Handshake size={19}/></div>{assists.length?assists.map((s,i)=><button className='leaderboard-row as-button' key={s.ref} onClick={()=>setProfile(s)}><span className={`rank ${i===0?'gold':''}`}>{i+1}</span><div><b>{s.name}</b><small>{s.team}</small></div><strong>{s.assists}</strong></button>):<p className='muted'>No assists recorded yet.</p>}</section>
      <section className='card'><div className='card-head'><div><span className='label'>STAR PLAYERS</span><h2>{age} players of the match</h2></div><Star size={19}/></div>{motm.length?motm.map((s,i)=><button className='leaderboard-row as-button' key={s.ref} onClick={()=>setProfile(s)}><span className={`rank ${i===0?'gold':''}`}>{i+1}</span><div><b>{s.name}</b><small>{s.team}</small></div><strong>{s.motm}</strong></button>):<p className='muted'>No awards recorded yet.</p>}</section>
    </div>}
    <section className='card'><div className='card-head'><div><span className='label'>LEAGUE NEWS</span><h2>Announcements</h2></div><Megaphone size={19}/></div>{published.map(c=><div className='public-news' key={c.id}><div><b>{c.title}</b><p>{c.message}</p></div><span className={`status ${c.priority==='Urgent'?'amber':c.priority==='Important'?'blue':'green'}`}>{c.priority}</span></div>)}{!published.length&&<p className='muted'>No public announcements.</p>}</section>
    {profile&&<PlayerProfile profile={profile} form={formByTeam.get(profile.team.toLowerCase())||null} onClose={()=>setProfile(null)}/>}
  </div>;
}

function PlayerProfile({profile,form,onClose}:{profile:StatLeader;form:FormRow|null;onClose:()=>void}){
  return <div className='profile-overlay' role='dialog' aria-modal='true' aria-label={`${profile.name} profile`} onClick={onClose}>
    <div className='profile-modal' onClick={e=>e.stopPropagation()}>
      <button className='profile-close' aria-label='Close profile' onClick={onClose}><X size={18}/></button>
      <div className='profile-head'><div className='profile-number'>{profile.number||'—'}</div><div><h2>{profile.name}</h2><p className='muted'>{profile.team}{profile.position?` · ${profile.position}`:''}{profile.ageGroup?` · ${profile.ageGroup}`:''}</p></div></div>
      <div className='profile-grid'>
        <div className='profile-stat'><span>{profile.apps}</span><small>Apps</small></div>
        <div className='profile-stat'><span>{profile.goals}</span><small>Goals</small></div>
        <div className='profile-stat'><span>{profile.assists}</span><small>Assists</small></div>
        <div className='profile-stat'><span>{profile.motm}</span><small>MOTM</small></div>
        <div className='profile-stat'><span>{profile.minutes}</span><small>Minutes</small></div>
        <div className='profile-stat'><span>{profile.avgRating||'—'}</span><small>Avg rating</small></div>
        <div className='profile-stat'><span>{profile.yellow}</span><small>Yellow</small></div>
        <div className='profile-stat'><span>{profile.red}</span><small>Red</small></div>
      </div>
      {form&&form.recent.length?<div className='profile-form'><span className='label'>{profile.team} RECENT FORM</span>{form.recent.map((r,k)=><div className='profile-form-row' key={k}><i className={`form-badge ${r.result.toLowerCase()}`}>{r.result}</i><span>{r.home?'vs':'@'} {r.opponent}</span><strong>{r.score}</strong><small>{r.date}</small></div>)}</div>:null}
    </div>
  </div>;
}
