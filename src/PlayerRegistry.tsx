import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ws } from './platformClient';
import { ArrowRightLeft, Check, ClipboardList, Shield, UserPlus, Users } from 'lucide-react';

type RegistryPlayer = {
  id: string;
  playerId: string;
  name: string;
  dob: string;
  requestedAgeGroup: string;
  team: string;
  position: string;
  number: number;
  memberRef: string;
  status: string;
  eligibility: string;
  registeredAt: number;
};

type Props = { role: string; setNotice: (value: string) => void };

const ages = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18'];

export default function PlayerRegistry({ role, setNotice }: Props) {
  const [players, setPlayers] = useState<RegistryPlayer[]>([]);
  const [tab, setTab] = useState('registry');
  const [form, setForm] = useState({ name: '', dob: '', requestedAgeGroup: 'U14', team: '', position: 'CM', number: '0', memberRef: '' });
  const [loading, setLoading] = useState(true);
  const connRef = useRef<ReturnType<typeof ws.connect> | null>(null);
  const canManage = role === 'LFA Admin' || role === 'Club';

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get('/api/player-registry');
      setPlayers(result.data || []);
    } catch {
      setNotice('Player registry could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const conn = ws.connect();
    connRef.current = conn;
    conn.onMessage(message => {
      if (message?.type !== 'entity.update') return;
      if (message.payload?.entity_type === 'player-registry' && Array.isArray(message.payload?.data)) setPlayers(message.payload.data);
    });
    conn.ready.then(() => {
      const connectionId = conn.connectionId;
      if (!connectionId) return;
      void api.post('/api/subscriptions', { entity_type: 'player-registry', entity_id: 'league', connection_id: connectionId });
    }).catch(() => undefined);
    return () => conn.disconnect();
  }, []);

  const pending = useMemo(() => players.filter(player => player.status === 'Pending'), [players]);
  const active = useMemo(() => players.filter(player => player.status === 'Active'), [players]);

  const submit = async () => {
    if (!canManage) {
      setNotice('Only club or league administrators can register players.');
      return;
    }
    if (!form.name.trim() || !form.dob || !form.team.trim() || !form.memberRef.trim()) {
      setNotice('Name, date of birth, team and member reference are required.');
      return;
    }
    try {
      const result = await api.post('/api/player-registry', {
        name: form.name.trim(),
        dob: form.dob,
        requestedAgeGroup: form.requestedAgeGroup,
        team: form.team.trim(),
        position: form.position,
        number: Number(form.number) || 0,
        memberRef: form.memberRef.trim()
      });
      setPlayers(current => [...current, result.data]);
      setForm({ name: '', dob: '', requestedAgeGroup: 'U14', team: '', position: 'CM', number: '0', memberRef: '' });
      setNotice(`Registration created. Player ID ${result.data.playerId}.`);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : 'Could not register player.';
      setNotice(message || 'Could not register player.');
    }
  };

  const decide = async (player: RegistryPlayer, status: 'Approved' | 'Rejected') => {
    if (!canManage) {
      setNotice('Only club or league administrators can decide registrations.');
      return;
    }
    try {
      const result = await api.put(`/api/player-registry/${player.id}`, { status });
      setPlayers(current => current.map(item => item.id === player.id ? result.data : item));
      setNotice(status === 'Approved' ? `${player.name} approved and assigned Player ID ${player.playerId}.` : `${player.name} registration rejected.`);
    } catch {
      setNotice('Could not update the player registration.');
    }
  };

  if (loading) return <div className='card empty-state'><h3>Loading player registry</h3><p>Syncing player identity, eligibility and registration history.</p></div>;

  return <>
    <section className='page-header'>
      <div><p className='eyebrow'>PLAYER REGISTRATION 2.0</p><h1>Player Registry & ID</h1><p className='muted'>A league-wide identity record for registration, eligibility, team assignment and auditable player movement.</p></div>
      <span className='status green'>{canManage ? 'Management access' : 'View only'}</span>
    </section>
    <div className='filters'>
      <button className={tab === 'registry' ? 'filter active' : 'filter'} onClick={() => setTab('registry')}>Registry</button>
      <button className={tab === 'pending' ? 'filter active' : 'filter'} onClick={() => setTab('pending')}>Pending · {pending.length}</button>
      <button className={tab === 'active' ? 'filter active' : 'filter'} onClick={() => setTab('active')}>Active · {active.length}</button>
    </div>

    {tab === 'registry' && <>
      <section className='stats-grid'>
        <Stat icon={<Users />} label='Registered players' value={`${players.length}`} detail='league identity records' />
        <Stat icon={<Check />} label='Active' value={`${active.length}`} detail='eligible player records' />
        <Stat icon={<ClipboardList />} label='Pending' value={`${pending.length}`} detail='registrations awaiting review' />
        <Stat icon={<Shield />} label='Eligibility' value={`${players.filter(player => player.eligibility === 'Eligible').length}`} detail='records passing age check' />
      </section>
      <section className='dashboard-grid'>
        <div className='card admin-panel'>
          <span className='label'>NEW PLAYER REGISTRATION</span><h2>Create identity record</h2>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder='Player full name' />
          <input type='date' value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
          <select value={form.requestedAgeGroup} onChange={e => setForm({ ...form, requestedAgeGroup: e.target.value })}>{ages.map(age => <option key={age}>{age}</option>)}</select>
          <input value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} placeholder='Registered team' />
          <div className='admin-grid'><select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>{['GK','CB','LB','RB','DM','CM','CAM','LW','RW','ST'].map(position => <option key={position}>{position}</option>)}</select><input type='number' min='0' max='99' value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder='Squad no.' /></div>
          <input value={form.memberRef} onChange={e => setForm({ ...form, memberRef: e.target.value })} placeholder='Existing member reference' />
          <button className='primary' onClick={submit}><UserPlus size={15} />Register player</button>
        </div>
        <div className='card'>
          <span className='label'>IDENTITY STANDARD</span><h2>What the registry controls</h2>
          <Queue title='Unique Player ID' detail='Stable league identity follows the player between teams.' icon={<Shield />} />
          <Queue title='Age-group eligibility' detail='Date of birth is checked against the requested age group.' icon={<Check />} />
          <Queue title='Registration status' detail='Pending, Active and Rejected states are retained.' icon={<ClipboardList />} />
          <Queue title='Movement history' detail='Player transfers remain a separate auditable workflow.' icon={<ArrowRightLeft />} />
        </div>
      </section>
    </>}

    {tab !== 'registry' && <div className='card'>
      <div className='card-head'><div><span className='label'>{tab === 'pending' ? 'REGISTRATION REVIEW' : 'ACTIVE REGISTRY'}</span><h2>{tab === 'pending' ? 'Registrations awaiting decision' : 'Verified player identities'}</h2></div><span className='status green'>Live</span></div>
      {(tab === 'pending' ? pending : active).map(player => <div className='admin-row' key={player.id}><div><b>{player.name}</b><small>{player.playerId} · {player.requestedAgeGroup} · {player.team} · {player.memberRef}</small></div><span className={`status ${player.eligibility === 'Eligible' ? 'green' : 'amber'}`}>{player.eligibility}</span>{tab === 'pending' && <><button className='ghost small' onClick={() => void decide(player, 'Approved')}>Approve</button><button className='ghost small' onClick={() => void decide(player, 'Rejected')}>Reject</button></>}</div>)}
      {!(tab === 'pending' ? pending : active).length && <div className='empty-state'><h3>{tab === 'pending' ? 'No pending registrations' : 'No active player identities'}</h3><p>Player records will appear here as the registry is populated.</p></div>}
    </div>}
  </>;
}

function Queue({ title, detail, icon }: { title: string; detail: string; icon: React.ReactNode }) { return <div className='queue'><span className='queue-icon'>{icon}</span><span><b>{title}</b><small>{detail}</small></span></div>; }
function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <div className='card stat'><div className='stat-icon'>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }
