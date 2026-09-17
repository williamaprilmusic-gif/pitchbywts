import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ws } from './platformClient';
import { Check, ChevronRight, Edit3, Plus, Shield, Users, UserRound, ArrowRightLeft, Building2, Trophy } from 'lucide-react';

type ClubProfile = { id:string; clubName:string; shortName:string; area:string; homeVenue:string; founded:string; colors:string; description:string };
type Staff = { id:string; name:string; role:string; team:string; status:string };
type Team = { id:string; name:string; ageGroup:string; played:number; won:number; drawn:number; lost:number; gf:number; ga:number; pts:number };
type Player = { id:string; name:string; team:string; position:string; number:number; status:string; rating:number; memberRef:string };
type Transfer = { id:string; playerRef:string; playerName:string; fromTeam:string; toTeam:string; status:string; requestedAt:number };

type Props = { role:string; setNotice:(v:string)=>void };

export default function ClubManagement({ role, setNotice }:Props){
  const [tab,setTab]=useState('dashboard');
  const [profile,setProfile]=useState<ClubProfile|null>(null);
  const [staff,setStaff]=useState<Staff[]>([]);
  const [teams,setTeams]=useState<Team[]>([]);
  const [players,setPlayers]=useState<Player[]>([]);
  const [transfers,setTransfers]=useState<Transfer[]>([]);
  const [loading,setLoading]=useState(true);
  const [edit,setEdit]=useState(false);
  const [profileForm,setProfileForm]=useState({clubName:'Liverpool Portland FC',shortName:'LPFC',area:'Mitchells Plain',homeVenue:'Portland Sports Ground',founded:'1991',colors:'Red · Green · White',description:'Community football club developing players and connecting families through grassroots football.'});
  const [staffForm,setStaffForm]=useState({name:'',role:'Club administrator',team:'Club-wide'});
  const [teamForm,setTeamForm]=useState({name:'',ageGroup:'U14'});
  const [transferForm,setTransferForm]=useState({playerRef:'',toTeam:''});
  const connRef=useRef<ReturnType<typeof ws.connect>|null>(null);
  const canManage=role==='LFA Admin'||role==='Club'||role==='Club Manager';

  const load=async()=>{
    setLoading(true);
    try{
      const [p,s,t,pl,tr]=await Promise.all([api.get('/api/club-profile'),api.get('/api/club-staff'),api.get('/api/teams'),api.get('/api/players'),api.get('/api/player-transfers')]);
      if(p.data){setProfile(p.data);setProfileForm({clubName:p.data.clubName,shortName:p.data.shortName,area:p.data.area,homeVenue:p.data.homeVenue,founded:p.data.founded,colors:p.data.colors,description:p.data.description});}
      setStaff(s.data||[]);setTeams(t.data||[]);setPlayers(pl.data||[]);setTransfers(tr.data||[]);
    }catch{setNotice('Club management data could not be loaded.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{
    void load();
    const conn=ws.connect();connRef.current=conn;
    conn.onMessage(msg=>{if(msg?.type!=='entity.update')return;const type=msg.payload?.entity_type;const data=msg.payload?.data;if(type==='club-profile'&&data)setProfile(data);if(type==='club-staff'&&Array.isArray(data))setStaff(data);if(type==='teams'&&Array.isArray(data))setTeams(data);if(type==='players'&&Array.isArray(data))setPlayers(data);if(type==='player-transfers'&&Array.isArray(data))setTransfers(data);});
    conn.ready.then(()=>{const id=conn.connectionId;if(!id)return;['club-profile','club-staff','teams','players','player-transfers'].forEach(entity=>void api.post('/api/subscriptions',{entity_type:entity,entity_id:'club',connection_id:id}));}).catch(()=>undefined);
    return()=>{conn.disconnect()};
  },[]);

  const saveProfile=async()=>{
    if(!canManage){setNotice('Only club or league administrators can edit the club profile.');return}
    if(!profileForm.clubName.trim()||!profileForm.area.trim()||!profileForm.homeVenue.trim()){setNotice('Club name, area and home venue are required.');return}
    try{const r=await api.put('/api/club-profile',profileForm);setProfile(r.data);setEdit(false);setNotice('Club profile saved.');}catch{setNotice('Could not save the club profile.');}
  };
  const addStaff=async()=>{
    if(!canManage){setNotice('Only club or league administrators can manage staff.');return}
    if(!staffForm.name.trim()){setNotice('Enter a staff member name.');return}
    try{await api.post('/api/club-staff',staffForm);setStaffForm({name:'',role:'Club administrator',team:'Club-wide'});setNotice('Staff member added.');}catch{setNotice('Could not add staff member.');}
  };
  const addTeam=async()=>{
    if(!canManage){setNotice('Only club or league administrators can add teams.');return}
    if(!teamForm.name.trim()){setNotice('Enter a team name.');return}
    try{const r=await api.post('/api/club-teams',teamForm);setTeams(t=>[...t,r.data]);setTeamForm({name:'',ageGroup:'U14'});setNotice('Team added to the club structure.');}catch{setNotice('Could not add team.');}
  };
  const requestTransfer=async()=>{
    if(!canManage){setNotice('Only club or league administrators can request transfers.');return}
    if(!transferForm.playerRef||!transferForm.toTeam){setNotice('Select a player and destination team.');return}
    const player=players.find(p=>p.memberRef===transferForm.playerRef);if(!player){setNotice('Player not found.');return}
    if(player.team===transferForm.toTeam){setNotice('Transfer blocked: the player is already registered to that team.');return}
    try{await api.post('/api/player-transfers',{playerRef:player.memberRef,playerName:player.name,fromTeam:player.team,toTeam:transferForm.toTeam});setTransferForm({playerRef:'',toTeam:''});setNotice('Transfer request submitted.');}catch{setNotice('Could not submit the transfer request.');}
  };
  const approveTransfer=async(t:Transfer)=>{if(!canManage){setNotice('Only club or league administrators can approve transfers.');return}try{await api.put(`/api/player-transfers/${t.id}`,{status:'Approved'});setNotice('Transfer approved and squad records updated.');}catch{setNotice('Could not approve the transfer.');}};

  const teamStats=useMemo(()=>teams.map(t=>({team:t,players:players.filter(p=>p.team===t.name).length})),[teams,players]);
  const pending=transfers.filter(t=>t.status==='Pending').length;
  if(loading)return <div className='card empty-state'><h3>Loading club management</h3><p>Syncing profile, staff, teams, squads and transfer records.</p></div>;

  return <div className='club-management'>
    <section className='page-header'><div><p className='eyebrow'>CLUB & TEAM MANAGEMENT 2.0</p><h1>{profile?.clubName||'Club management'}</h1><p className='muted'>One operating layer for club identity, staff, teams, squads and player movement.</p></div><span className='status green'>{canManage?'Management access':'View only'}</span></section>
    <div className='filters'>{[['dashboard','Dashboard'],['profile','Club profile'],['staff','Staff & roles'],['teams','Teams'],['transfers','Transfers'],['public','Public club']].map(([v,label])=><button key={v} className={tab===v?'filter active':'filter'} onClick={()=>setTab(v)}>{label}</button>)}</div>
    {tab==='dashboard'&&<>
      <section className='stats-grid'><Stat icon={<Building2/>} label='Club teams' value={`${teams.length}`} detail='active age groups'/><Stat icon={<Users/>} label='Registered players' value={`${players.length}`} detail='squad records'/><Stat icon={<UserRound/>} label='Staff' value={`${staff.length}`} detail='club & team roles'/><Stat icon={<ArrowRightLeft/>} label='Pending transfers' value={`${pending}`} detail='requests to review'/></section>
      <section className='dashboard-grid'><div className='card'><div className='card-head'><div><span className='label'>CLUB IDENTITY</span><h2>{profile?.shortName||'LPFC'}</h2></div><Building2 size={19}/></div><p className='muted'>{profile?.description}</p><div className='roadmap-items'><span>{profile?.area}</span><span>{profile?.homeVenue}</span><span>Est. {profile?.founded}</span><span>{profile?.colors}</span></div><button className='text-btn' onClick={()=>setTab('profile')}>Manage club profile <ChevronRight size={15}/></button></div><div className='card'><div className='card-head'><div><span className='label'>TEAM HEALTH</span><h2>Squad coverage</h2></div><Trophy size={19}/></div>{teamStats.slice(0,6).map(x=><div className='mini-row' key={x.team.id}><span className='rank'>{x.team.ageGroup}</span><b>{x.team.name}</b><span>{x.players} players</span><strong>{x.team.pts} pts</strong></div>)}{!teamStats.length&&<div className='empty-state'><p>No teams yet.</p></div>}</div></section>
    </>}
    {tab==='profile'&&<div className='card admin-panel'><div className='card-head'><div><span className='label'>CLUB PROFILE</span><h2>Identity & public information</h2></div><button className='ghost' onClick={()=>setEdit(!edit)}><Edit3 size={15}/>{edit?'Cancel':'Edit profile'}</button></div>{edit?<><input value={profileForm.clubName} onChange={e=>setProfileForm({...profileForm,clubName:e.target.value})} placeholder='Club name'/><input value={profileForm.shortName} onChange={e=>setProfileForm({...profileForm,shortName:e.target.value})} placeholder='Short name'/><input value={profileForm.area} onChange={e=>setProfileForm({...profileForm,area:e.target.value})} placeholder='Community / area'/><input value={profileForm.homeVenue} onChange={e=>setProfileForm({...profileForm,homeVenue:e.target.value})} placeholder='Home venue'/><input value={profileForm.founded} onChange={e=>setProfileForm({...profileForm,founded:e.target.value})} placeholder='Founded'/><input value={profileForm.colors} onChange={e=>setProfileForm({...profileForm,colors:e.target.value})} placeholder='Club colours'/><textarea value={profileForm.description} onChange={e=>setProfileForm({...profileForm,description:e.target.value})} placeholder='Public club description'/><button className='primary' onClick={saveProfile}><Check size={15}/>Save club profile</button></>:<div className='roadmap-items'><span><b>{profile?.clubName}</b></span><span>Short name: {profile?.shortName}</span><span>Area: {profile?.area}</span><span>Home: {profile?.homeVenue}</span><span>Founded: {profile?.founded}</span><span>Colours: {profile?.colors}</span></div>}</div>}
    {tab==='staff'&&<section className='dashboard-grid'><div className='card admin-panel'><span className='label'>STAFF & ROLES</span><h2>Add club staff</h2><input value={staffForm.name} onChange={e=>setStaffForm({...staffForm,name:e.target.value})} placeholder='Staff member name'/><select value={staffForm.role} onChange={e=>setStaffForm({...staffForm,role:e.target.value})}><option>Club administrator</option><option>Head coach</option><option>Team manager</option><option>Assistant coach</option><option>Safeguarding lead</option><option>Team secretary</option></select><select value={staffForm.team} onChange={e=>setStaffForm({...staffForm,team:e.target.value})}><option>Club-wide</option>{teams.map(t=><option key={t.id}>{t.name}</option>)}</select><button className='primary' onClick={addStaff}><Plus size={15}/>Add staff role</button></div><div className='card'><span className='label'>CURRENT STAFF</span><h2>Responsibilities</h2>{staff.map(s=><div className='admin-row' key={s.id}><div><b>{s.name}</b><small>{s.role} · {s.team}</small></div><span className='status green'>{s.status}</span></div>)}{!staff.length&&<div className='empty-state'><p>No staff roles recorded yet.</p></div>}</div></section>}
    {tab==='teams'&&<section className='dashboard-grid'><div className='card admin-panel'><span className='label'>TEAM STRUCTURE</span><h2>Create a club team</h2><input value={teamForm.name} onChange={e=>setTeamForm({...teamForm,name:e.target.value})} placeholder='Example: Liverpool Portland U16'/><select value={teamForm.ageGroup} onChange={e=>setTeamForm({...teamForm,ageGroup:e.target.value})}><option>U8</option><option>U10</option><option>U12</option><option>U14</option><option>U16</option><option>U18</option></select><button className='primary' onClick={addTeam}><Plus size={15}/>Add team</button></div><div className='card'><span className='label'>CLUB TEAMS</span><h2>Age-group squads</h2>{teamStats.map(x=><div className='admin-row' key={x.team.id}><div><b>{x.team.name}</b><small>{x.team.ageGroup} · {x.players} registered players · {x.team.pts} points</small></div><span className='status blue'>{x.team.played}P</span></div>)}{!teamStats.length&&<div className='empty-state'><p>No club teams recorded.</p></div>}</div></section>}
    {tab==='transfers'&&<section className='dashboard-grid'><div className='card admin-panel'><span className='label'>PLAYER TRANSFER WORKFLOW</span><h2>Move a player between teams</h2><select value={transferForm.playerRef} onChange={e=>setTransferForm({...transferForm,playerRef:e.target.value})}><option value=''>Select player</option>{players.map(p=><option key={p.id} value={p.memberRef}>{p.name} · {p.team}</option>)}</select><select value={transferForm.toTeam} onChange={e=>setTransferForm({...transferForm,toTeam:e.target.value})}><option value=''>Destination team</option>{teams.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}</select><button className='primary' onClick={requestTransfer}><ArrowRightLeft size={15}/>Request transfer</button><small>Transfers are staged first, then approved so squad history remains auditable.</small></div><div className='card'><span className='label'>TRANSFER LEDGER</span><h2>Requests & decisions</h2>{transfers.slice().reverse().map(t=><div className='admin-row' key={t.id}><div><b>{t.playerName}</b><small>{t.fromTeam} → {t.toTeam}</small></div><span className={`status ${t.status==='Approved'?'green':'amber'}`}>{t.status}</span>{t.status==='Pending'&&<button className='ghost small' onClick={()=>approveTransfer(t)}>Approve</button>}</div>)}{!transfers.length&&<div className='empty-state'><p>No transfer requests yet.</p></div>}</div></section>}
    {tab==='public'&&<div className='card public-club'><span className='label'>PUBLIC CLUB PAGE</span><h2>{profile?.clubName}</h2><p className='muted'>{profile?.description}</p><div className='roadmap-items'><span>{profile?.area}</span><span>Home venue: {profile?.homeVenue}</span><span>{teams.length} teams</span><span>{players.length} players</span></div><h3>Teams</h3>{teams.map(t=><div className='mini-row' key={t.id}><b>{t.name}</b><span>{t.ageGroup}</span><strong>{t.pts} pts</strong></div>)}</div>}
  </div>;
}
function Stat({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail:string}){return <div className='card stat'><div className='stat-icon'>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>}
