import { useEffect, useMemo, useState } from 'react';
import { api, ws } from '@appdeploy/client';
import { Activity, CalendarDays, Check, CircleDollarSign, ClipboardCheck, GitBranch, Shield, Trophy, UserPlus, Users, X } from 'lucide-react';

type Role = 'Supporter' | 'Manager' | 'Club' | 'LFA Admin';
type Player = { id: string; playerId: string; teamId: string; clubId: string; name: string; team: string; position: string; number: number; status: string; rating: number; memberRef: string };
type Attendance = { id: string; playerId: string; fixtureId: string; status: string; note?: string; updatedAt: number };
type Guardian = { id: string; playerId: string; relationship: string; status: string; createdAt?: number };
type Invoice = { id: string; memberRef: string; item: string; amount: number; status: string; dueDate: string };
type Performance = { id: string; fixtureId: string; playerRef: string; appearance: string; minutes: number; goals: number; assists: number; yellow: number; red: number; saves: number; rating: number; motm: boolean };
type Transfer = { id: string; playerRef: string; playerName: string; fromTeam: string; toTeam: string; status: string; requestedAt: number };
type Registration = Record<string, unknown>;
type Communication = { id: string; title: string; message: string; priority: string; createdAt: number };
type Data = { version: string; role: Role; scope: { leagueId?: string; clubId?: string; teamId?: string }; players: Player[]; guardians: Guardian[]; guardianRequests?: Guardian[]; attendance: Attendance[]; registrations: Registration[]; finance: { invoices: Invoice[]; outstanding: number }; performance: Performance[]; transfers: Transfer[]; communications: Communication[]; safeguarding: { guardianDataHiddenForStaff: boolean; privateDataRequiresApprovedGuardian: boolean }; permissions: string[] };

export default function PlayerFamilySystem({ setNotice }: { setNotice: (v: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [relationship, setRelationship] = useState('Parent/Guardian');
  const [requesting, setRequesting] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState('Present');
  const [attendancePlayer, setAttendancePlayer] = useState('');
  const [attendanceFixture, setAttendanceFixture] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get('/api/player-family-system');
      setData(result.data);
      if (!selected && result.data?.players?.[0]?.playerId) setSelected(result.data.players[0].playerId);
    } catch {
      setNotice('Could not load Player & Family Operating System.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const conn = ws.connect();
    conn.onMessage(msg => {
      if (msg?.type === 'entity.update' && msg.payload?.entity_type === 'player-family-system') void load();
    });
    void conn.ready.then(() => {
      if (conn.connectionId) return api.post('/api/subscriptions', { entity_type: 'player-family-system', entity_id: 'league', connection_id: conn.connectionId });
      return undefined;
    }).catch(() => undefined);
    return () => conn.disconnect();
  }, []);

  const player = data?.players.find(p => p.playerId === selected) || data?.players[0];
  const playerAttendance = useMemo(() => data?.attendance.filter(a => a.playerId === player?.playerId) || [], [data, player]);
  const playerPerformance = useMemo(() => data?.performance.filter(p => p.playerRef === player?.memberRef) || [], [data, player]);
  const playerTransfers = useMemo(() => data?.transfers.filter(t => t.playerRef === player?.memberRef) || [], [data, player]);
  const pendingRequests = data?.guardianRequests || [];

  const requestGuardian = async () => {
    if (!player) return;
    setRequesting(true);
    try {
      await api.post('/api/player-family/guardian-requests', { playerId: player.playerId, relationship });
      setNotice('Guardian relationship request submitted for LFA review.');
      await load();
    } catch {
      setNotice('Could not submit guardian request.');
    } finally {
      setRequesting(false);
    }
  };

  const saveAttendance = async () => {
    if (!attendancePlayer || !attendanceFixture) {
      setNotice('Select a player and enter a fixture ID.');
      return;
    }
    try {
      await api.post('/api/player-family/attendance', { playerId: attendancePlayer, fixtureId: attendanceFixture, status: attendanceStatus });
      setNotice('Attendance saved.');
      await load();
    } catch {
      setNotice('Could not save attendance.');
    }
  };

  const reviewGuardian = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      await api.put(`/api/player-family/guardian-requests/${id}`, { status });
      setNotice(`Guardian request ${status.toLowerCase()}.`);
      await load();
    } catch {
      setNotice('Could not update guardian request.');
    }
  };

  if (!data) return <div className='card'><div className='empty-state'><h3>{loading ? 'Loading Player & Family Operating System 13.0' : 'Workspace unavailable'}</h3><p>{loading ? 'Resolving the signed-in account scope and protected player records.' : 'Sign in with an authorized account to continue.'}</p></div></div>;

  return <>
    <section className='page-header'>
      <div><p className='eyebrow'>PLAYER & FAMILY OPERATING SYSTEM 13.0</p><h1>{data.role === 'Supporter' ? 'Your family football home' : data.role === 'Manager' ? 'Player welfare & readiness' : data.role === 'Club' ? 'Club player & family operations' : 'League player & family governance'}</h1><p className='muted'>A protected youth-player lifecycle workspace linking players, approved guardians, teams, attendance, registration, payments, development and safeguarding boundaries.</p></div>
      <span className='status green'>Server scoped</span>
    </section>

    <section className='stats-grid'>
      <Stat label='Players in scope' value={`${data.players.length}`} detail='non-identifying player records' icon={<Users />} />
      <Stat label='Attendance' value={`${data.attendance.length}`} detail='saved match records' icon={<ClipboardCheck />} />
      <Stat label='Outstanding' value={`R${data.finance.outstanding.toLocaleString('en-ZA')}`} detail='scoped finance balance' icon={<CircleDollarSign />} />
      <Stat label='Development' value={`${data.performance.length}`} detail='performance records' icon={<Trophy />} />
    </section>

    <section className='dashboard-grid'>
      <div className='card'>
        <div className='card-head'><div><span className='label'>PLAYER REGISTRY</span><h2>Players in scope</h2></div><Users size={19} /></div>
        {data.players.length ? data.players.map(p => <button className={`cos-team-row ${selected === p.playerId ? 'selected' : ''}`} key={p.playerId} onClick={() => setSelected(p.playerId)}><div className='cos-team-badge'>{p.number || '—'}</div><div><b>{p.name}</b><small>{p.team} · {p.position} · {p.playerId}</small></div><span className='status blue'>{p.status}</span></button>) : <div className='empty-state'><h3>No players in your operating scope</h3><p>Player access is limited by your signed-in role and durable league, club or team scope.</p></div>}
      </div>
      <div className='card'>
        <div className='card-head'><div><span className='label'>PLAYER PROFILE</span><h2>{player?.name || 'No player selected'}</h2></div><Shield size={19} /></div>
        {player && <>
          <div className='cos-person'><div className='cos-avatar'>{player.number || 'P'}</div><div><b>{player.position} · #{player.number}</b><small>{player.team} · Member ref {player.memberRef}</small></div><span className='status green'>{player.status}</span></div>
          <div className='readiness-grid'><Readiness label='Registration' ok={data.registrations.some(r => String(r.playerId || '') === player.playerId || String(r.memberRef || '') === player.memberRef)} /><Readiness label='Attendance' ok={playerAttendance.length > 0} /><Readiness label='Development' ok={playerPerformance.length > 0} /><Readiness label='Transfer history' ok={playerTransfers.length > 0} /></div>
          {data.role === 'Supporter' && <div className='card family-request'><span className='label'>GUARDIAN ACCESS</span><h3>Request family relationship</h3><p className='muted'>Private family information stays protected until an LFA administrator approves the relationship.</p><select value={relationship} onChange={e => setRelationship(e.target.value)}><option>Parent/Guardian</option><option>Legal guardian</option><option>Family representative</option></select><button className='primary' onClick={() => void requestGuardian()} disabled={requesting}>{requesting ? 'Submitting' : 'Request relationship'}</button></div>}
        </>}
      </div>
    </section>

    <section className='dashboard-grid lower'>
      <div className='card'>
        <div className='card-head'><div><span className='label'>ATTENDANCE & READINESS</span><h2>Match attendance</h2></div><CalendarDays size={19} /></div>
        {data.role !== 'Supporter' && <><select value={attendancePlayer} onChange={e => setAttendancePlayer(e.target.value)}><option value=''>Select player</option>{data.players.map(p => <option key={p.playerId} value={p.playerId}>{p.name} · {p.team}</option>)}</select><input value={attendanceFixture} onChange={e => setAttendanceFixture(e.target.value)} placeholder='Fixture ID' /><select value={attendanceStatus} onChange={e => setAttendanceStatus(e.target.value)}><option>Present</option><option>Absent</option><option>Late</option><option>Excused</option></select><button className='primary' onClick={() => void saveAttendance()}><ClipboardCheck size={15} />Save attendance</button></>}
        {playerAttendance.map(a => <div className='admin-row' key={a.id}><div><b>{a.status}</b><small>{a.fixtureId}{a.note ? ` · ${a.note}` : ''}</small></div><span className='status blue'>{new Date(a.updatedAt).toLocaleDateString('en-ZA')}</span></div>)}
        {!playerAttendance.length && <div className='empty-state'><h3>No attendance records</h3><p>Attendance will appear after an authorized staff member records it.</p></div>}
      </div>
      <div className='card'>
        <div className='card-head'><div><span className='label'>DEVELOPMENT TIMELINE</span><h2>Player progress</h2></div><Activity size={19} /></div>
        {playerPerformance.slice(-8).reverse().map(p => <div className='admin-row' key={p.id}><div><b>{p.appearance} · {p.minutes} min</b><small>{p.goals} goals · {p.assists} assists · rating {p.rating}/10</small></div><span className='status green'>{p.motm ? 'MOTM' : 'Recorded'}</span></div>)}
        {!playerPerformance.length && <div className='empty-state'><h3>No development events yet</h3><p>Performance records will build the player timeline after matches.</p></div>}
      </div>
    </section>

    <section className='dashboard-grid'>
      <div className='card'>
        <div className='card-head'><div><span className='label'>REGISTRATION & MOVEMENT</span><h2>Player lifecycle</h2></div><GitBranch size={19} /></div>
        {playerTransfers.map(t => <div className='admin-row' key={t.id}><div><b>{t.playerName}</b><small>{t.fromTeam} → {t.toTeam}</small></div><span className='status amber'>{t.status}</span></div>)}
        {data.registrations.filter(r => String(r.memberRef || '') === player?.memberRef).map((r, i) => <div className='admin-row' key={`${String(r.id)}-${i}`}><div><b>Registration</b><small>{String(r.status || 'Pending')} · {String(r.requestedAgeGroup || 'Age group review')}</small></div><span className='status blue'>{String(r.status || 'Pending')}</span></div>)}
        {!playerTransfers.length && !data.registrations.some(r => String(r.memberRef || '') === player?.memberRef) && <div className='empty-state'><h3>No movement records</h3><p>Transfers and registration decisions will appear here.</p></div>}
      </div>
      <div className='card'>
        <div className='card-head'><div><span className='label'>FAMILY & SAFEGUARDING</span><h2>Access boundary</h2></div><Shield size={19} /></div>
        {data.role === 'LFA Admin' && pendingRequests.map(g => <div className='admin-row' key={g.id}><div><b>{g.relationship}</b><small>{g.playerId} · Pending guardian relationship</small></div><button className='ghost small' onClick={() => void reviewGuardian(g.id, 'Approved')}><Check size={13} />Approve</button><button className='ghost small' onClick={() => void reviewGuardian(g.id, 'Rejected')}><X size={13} />Reject</button></div>)}
        <Queue title={data.role === 'LFA Admin' ? `${pendingRequests.length} guardian requests pending` : 'Guardian verification'} detail={data.role === 'LFA Admin' ? 'Review relationship requests without exposing guardian contact details.' : 'Private family records require an approved guardian relationship.'} icon={<UserPlus />} />
        <Queue title='Staff privacy' detail='Staff roles never receive guardian contact or account details.' icon={<Shield />} />
        <Queue title='Approved access' detail='Guardian relationships are explicitly reviewed by the LFA before private family access.' icon={<Check />} />
        <div className='cos-permissions'><Shield size={15} /><span>Protected scope</span>{data.permissions.map(p => <b key={p}>{p}</b>)}</div>
      </div>
    </section>

    <div className='card'><div className='card-head'><div><span className='label'>COMMUNICATIONS</span><h2>Relevant updates</h2></div><Trophy size={19} /></div>{data.communications.map(c => <div className='cos-notice' key={c.id}><div><b>{c.title}</b><small>{c.message}</small></div><span className={`status ${c.priority === 'Urgent' ? 'amber' : 'blue'}`}>{c.priority}</span></div>)}{!data.communications.length && <div className='empty-state'><h3>No updates yet</h3><p>Relevant club and league communications will appear here.</p></div>}</div>
  </>;
}

function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className='card stat'><div className='stat-icon'>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}
function Readiness({ label, ok }: { label: string; ok: boolean }) {
  return <div className={`readiness-item ${ok ? 'ready' : 'needs'}`}><span>{ok ? <Check size={15} /> : <Activity size={15} />}</span><div><b>{label}</b><small>{ok ? 'Ready' : 'Needs attention'}</small></div></div>;
}
function Queue({ title, detail, icon }: { title: string; detail: string; icon: React.ReactNode }) {
  return <div className='queue'><span className='queue-icon'>{icon}</span><span><b>{title}</b><small>{detail}</small></span></div>;
}
