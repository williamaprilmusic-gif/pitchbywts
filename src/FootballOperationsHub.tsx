import { useEffect, useMemo, useState } from 'react';
import { Activity, Bell, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign, Heart, Plus, Shield, Trophy, Users } from 'lucide-react';
import { api } from './platformClient';

type Role = 'Supporter'|'Manager'|'Club'|'LFA Admin';
type Fixture = { id:string; home:string; away:string; date:string; time:string; venue:string; status:string; homeScore?:number; awayScore?:number };
type Player = { id:string; name:string; team:string; position:string; number:number; status:string; rating:number; memberRef:string };
type Training = { id:string; title:string; team:string; date:string; startTime:string; venue:string; status:string; notes?:string; createdBy?:string };
type Communication = { id:string; title:string; message:string; priority:string; createdAt:number };
type Favourite = { id:string; entityType:string; entityId:string; label:string };

type Props = { role:Role; fixtures:Fixture[]; players:Player[]; communications:Communication[]; navigate:(tab:any)=>void; setNotice:(value:string)=>void };

export default function FootballOperationsHub({ role, fixtures, players, communications, navigate, setNotice }: Props) {
  const [training, setTraining] = useState<Training[]>([]);
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [title, setTitle] = useState('Team training');
  const [team, setTeam] = useState(players[0]?.team || '');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('17:30');
  const [venue, setVenue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [t, f] = await Promise.all([api.get('/api/training-sessions'), api.get('/api/favourites')]);
      if (Array.isArray(t.data)) setTraining(t.data);
      if (Array.isArray(f.data)) setFavourites(f.data);
    } catch { setNotice('Some operations data could not be loaded.'); }
  };
  useEffect(() => { void load(); }, []);

  const upcoming = useMemo(() => [...fixtures].filter(f => f.status === 'upcoming').sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0,4), [fixtures]);
  const unreadLike = communications.filter(c => c.priority === 'Urgent' || c.priority === 'Important').slice(0,4);
  const nextTraining = [...training].filter(t => t.date >= new Date().toISOString().slice(0,10)).sort((a,b)=>`${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];

  const createTraining = async () => {
    if (!title.trim() || !team.trim() || !date || !venue.trim()) { setNotice('Complete the training title, team, date and venue.'); return; }
    setSaving(true);
    try {
      const result = await api.post('/api/training-sessions', { title:title.trim(), team:team.trim(), date, startTime, venue:venue.trim(), status:'Scheduled' });
      if (result.data) setTraining(v => [...v, result.data]);
      setNotice('Training session scheduled.');
      setTitle('Team training'); setDate(''); setVenue('');
    } catch { setNotice('Could not schedule training.'); }
    finally { setSaving(false); }
  };

  const toggleFavourite = async (entityType:string, entityId:string, label:string) => {
    const existing = favourites.find(f => f.entityType === entityType && f.entityId === entityId);
    try {
      if (existing) {
        await api.delete(`/api/favourites/${existing.id}`);
        setFavourites(v => v.filter(f => f.id !== existing.id));
      } else {
        const result = await api.post('/api/favourites', { entityType, entityId, label });
        if (result.data) setFavourites(v => [...v, result.data]);
      }
    } catch { setNotice('Could not update favourites.'); }
  };
  const isFavourite = (type:string,id:string) => favourites.some(f => f.entityType === type && f.entityId === id);

  const roleTitle = role === 'Supporter' ? 'Your football home' : role === 'Manager' ? 'Team operations' : role === 'Club' ? 'Club operations' : 'League operations';
  const roleDescription = role === 'Supporter' ? 'Fixtures, followed teams, live updates and family football information in one place.' : role === 'Manager' ? 'Availability, squad selection, training, matchday and player development from one operating view.' : role === 'Club' ? 'Teams, players, training, fixtures, payments, communications and development in one club view.' : 'Competition, club, matchday, discipline and operational oversight without duplicate workspaces.';

  return <>
    <section className='page-header'>
      <div><p className='eyebrow'>PITCHLINE OPERATIONS HUB</p><h1>{roleTitle}</h1><p className='muted'>{roleDescription}</p></div>
      <span className='status green'>Role-aware</span>
    </section>

    <section className='stats-grid'>
      <Stat icon={<CalendarDays/>} label='Upcoming fixtures' value={`${upcoming.length}`} detail='next scheduled matches'/>
      <Stat icon={<Users/>} label='Players' value={`${players.length}`} detail='players in current scope'/>
      <Stat icon={<Activity/>} label='Training' value={`${training.length}`} detail='scheduled sessions'/>
      <Stat icon={<Bell/>} label='Priority updates' value={`${unreadLike.length}`} detail='important or urgent messages'/>
    </section>

    <section className='dashboard-grid'>
      <div className='card'>
        <div className='card-head'><div><span className='label'>ONE FOOTBALL CALENDAR</span><h2>Upcoming activity</h2></div><CalendarDays size={19}/></div>
        {upcoming.map(f => <div className='admin-row' key={f.id}><div><b>{f.home} vs {f.away}</b><small>{f.date} · {f.time} · {f.venue}</small></div><button className='ghost small' onClick={()=>toggleFavourite('fixture',f.id,`${f.home} vs ${f.away}`)}><Heart size={13} fill={isFavourite('fixture',f.id)?'currentColor':'none'}/>{isFavourite('fixture',f.id)?'Following':'Follow'}</button></div>)}
        {nextTraining && <div className='admin-row'><div><b>{nextTraining.title}</b><small>{nextTraining.date} · {nextTraining.startTime} · {nextTraining.team} · {nextTraining.venue}</small></div><span className='status blue'>Training</span></div>}
        {!upcoming.length && !nextTraining && <div className='empty-state'><h3>No upcoming activity</h3><p>Your shared football calendar will populate as fixtures and training are scheduled.</p></div>}
      </div>
      <div className='card'>
        <div className='card-head'><div><span className='label'>CONNECTED WORKSPACES</span><h2>Work from one place</h2></div><ChevronRight size={19}/></div>
        <Action label='Availability & family' detail='Player availability, guardians, attendance and safeguarding.' icon={<Users/>} onClick={()=>navigate('player-family-system')}/>
        <Action label='Squad & matchday' detail='Selection, formation, captain and digital team sheet.' icon={<Shield/>} onClick={()=>navigate('matchday')}/>
        <Action label='Performance' detail='Minutes, goals, assists, cards, ratings and development.' icon={<Trophy/>} onClick={()=>navigate('performance')}/>
        <Action label='Communications' detail='Club announcements and priority notifications.' icon={<Bell/>} onClick={()=>navigate('communications')}/>
        {(role === 'Club' || role === 'LFA Admin') && <Action label='Finance & payments' detail='Membership, registration invoices and payment status.' icon={<CircleDollarSign/>} onClick={()=>navigate('finance')}/>} 
      </div>
    </section>

    {(role === 'Manager' || role === 'Club' || role === 'LFA Admin') && <section className='dashboard-grid'>
      <div className='card'>
        <div className='card-head'><div><span className='label'>TRAINING MANAGEMENT</span><h2>Schedule a session</h2></div><Plus size={19}/></div>
        <div className='form-grid'><input value={title} onChange={e=>setTitle(e.target.value)} placeholder='Session title'/><select value={team} onChange={e=>setTeam(e.target.value)}><option value=''>Select team</option>{Array.from(new Set(players.map(p=>p.team))).map(t=><option key={t} value={t}>{t}</option>)}</select><input type='date' value={date} onChange={e=>setDate(e.target.value)}/><input type='time' value={startTime} onChange={e=>setStartTime(e.target.value)}/><input value={venue} onChange={e=>setVenue(e.target.value)} placeholder='Training venue'/></div>
        <button className='primary' disabled={saving} onClick={()=>void createTraining()}><Plus size={15}/>{saving?'Saving':'Schedule training'}</button>
        {training.slice(-5).reverse().map(t=><div className='admin-row' key={t.id}><div><b>{t.title}</b><small>{t.team} · {t.date} · {t.startTime} · {t.venue}</small></div><span className='status green'>{t.status}</span></div>)}
      </div>
      <div className='card'>
        <div className='card-head'><div><span className='label'>ROLE WORKFLOW</span><h2>Next actions</h2></div><CheckCircle2 size={19}/></div>
        <Action label='Confirm player availability' detail='Get attendance before selecting the squad.' icon={<CheckCircle2/>} onClick={()=>navigate('player-family-system')}/>
        <Action label='Prepare next fixture' detail='Select starters, substitutes and captain.' icon={<Shield/>} onClick={()=>navigate('matchday')}/>
        <Action label='Publish club update' detail='Send one communication to the right audience.' icon={<Bell/>} onClick={()=>navigate('communications')}/>
        <Action label='Review development' detail='Use match performance as the player timeline.' icon={<Trophy/>} onClick={()=>navigate('performance')}/>
      </div>
    </section>}

    <section className='dashboard-grid lower'>
      <div className='card'><div className='card-head'><div><span className='label'>FAVOURITES</span><h2>Followed football</h2></div><Heart size={19}/></div>{favourites.slice(0,8).map(f=><div className='admin-row' key={f.id}><div><b>{f.label}</b><small>{f.entityType}</small></div><button className='ghost small' onClick={()=>void toggleFavourite(f.entityType,f.entityId,f.label)}>Remove</button></div>)}{!favourites.length&&<div className='empty-state'><h3>Nothing followed yet</h3><p>Follow fixtures from this hub to keep the important matches close.</p></div>}</div>
      <div className='card'><div className='card-head'><div><span className='label'>PRIORITY COMMUNICATIONS</span><h2>What matters now</h2></div><Bell size={19}/></div>{unreadLike.map(c=><div className='admin-row' key={c.id}><div><b>{c.title}</b><small>{c.message}</small></div><span className={`status ${c.priority==='Urgent'?'amber':'blue'}`}>{c.priority}</span></div>)}{!unreadLike.length&&<div className='empty-state'><h3>No priority updates</h3><p>Important club and league communications will appear here.</p></div>}</div>
    </section>
  </>;
}

function Stat({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}){return <div className='card stat'><div className='stat-icon'>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>}
function Action({label,detail,icon,onClick}:{label:string;detail:string;icon:React.ReactNode;onClick:()=>void}){return <button className='queue' onClick={onClick}><span className='queue-icon'>{icon}</span><span><b>{label}</b><small>{detail}</small></span><ChevronRight size={15}/></button>}
