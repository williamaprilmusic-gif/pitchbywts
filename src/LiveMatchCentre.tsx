import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ws } from './platformClient';
import { AlertTriangle, CheckCircle2, CircleStop, Clock3, CornerUpRight, Flag, Goal, Pause, Play, RefreshCw, Shield, Square, Undo2, Users, WifiOff } from 'lucide-react';

type Fixture = { id: string; home: string; away: string; date: string; time: string; venue: string; status: string; homeScore?: number; awayScore?: number; matchdayStatus?: string };
type Player = { id: string; name: string; team: string; position: string; number: number; status: string; rating: number; memberRef: string };
type TeamSheet = { id: string; fixtureId: string; formation: string; captainRef: string; starters: string[]; substitutes: string[]; attendance: string[] };
type LiveEvent = { id: string; fixtureId: string; type: string; minute: number; clockSeconds: number; team?: string; player?: string; relatedPlayer?: string; playerOffRef?: string; playerOnRef?: string; createdAt: number; createdBy?: string };
type LiveState = { id?: string; fixtureId: string; status: 'Scheduled' | 'Live' | 'Half time' | 'Paused' | 'Full time'; startedAt?: number; pausedAt?: number; elapsedSeconds: number; homeScore: number; awayScore: number; updatedAt: number; events: LiveEvent[]; rules?: { ageGroup: string; allowedEvents: string[] } };
type Props = { role: string; setNotice: (value: string) => void };
type PendingEvent = { fixtureId: string; type: string; team?: string; player?: string; minute: number; clockSeconds: number; playerOffRef?: string; playerOnRef?: string };

type EventDef = { type: string; label: string; accent: string; icon: React.ComponentType<{ size?: number }> };
const events: EventDef[] = [
  { type: 'Goal', label: 'Goal', accent: 'goal', icon: Goal },
  { type: 'Yellow card', label: 'Yellow', accent: 'yellow', icon: Square },
  { type: 'Red card', label: 'Red', accent: 'red', icon: Square },
  { type: 'Offside', label: 'Offside', accent: 'offside', icon: Flag },
  { type: 'Substitution', label: 'Sub', accent: 'sub', icon: Users },
  { type: 'Injury', label: 'Injury', accent: 'injury', icon: AlertTriangle },
  { type: 'Corner', label: 'Corner', accent: 'corner', icon: CornerUpRight }
];

function readQueue(key: string): PendingEvent[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTeam(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function LiveMatchCentre({ role, setNotice }: Props) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [live, setLive] = useState<LiveState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamSheet, setTeamSheet] = useState<TeamSheet | null>(null);
  const [eventFilter, setEventFilter] = useState('All');
  const [quickType, setQuickType] = useState('');
  const [quickTeam, setQuickTeam] = useState('');
  const [quickPlayer, setQuickPlayer] = useState('');
  const [quickOff, setQuickOff] = useState('');
  const [quickOn, setQuickOn] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const connectionRef = useRef<ReturnType<typeof ws.connect> | null>(null);
  const canManage = ['LFA Admin', 'Manager', 'Club Manager'].includes(role);
  const queueKey = selectedId ? `pitchline:live-pending:${selectedId}` : '';

  const loadFixtures = async () => {
    try {
      const response = await api.get('/api/fixtures');
      setFixtures((response.data || []).filter((fixture: Fixture) => fixture.status !== 'completed' || fixture.matchdayStatus === 'Live'));
    } catch {
      setNotice('Could not load live fixtures.');
    }
  };

  const loadMatch = async (fixtureId: string) => {
    if (!fixtureId) {
      setLive(null);
      return;
    }
    try {
      const [liveResponse, contextResponse] = await Promise.all([
        api.get(`/api/live-match/${fixtureId}`),
        api.get(`/api/live-match/${fixtureId}/context`)
      ]);
      const context = contextResponse.data || {};
      const ruleResponse = await api.get(`/api/live-match/${fixtureId}/rules`).catch(() => ({ data: undefined }));
      setLive(liveResponse.data);
      setPlayers(context.players || []);
      const sheets: TeamSheet[] = context.teamSheets || [];
      setTeamSheet(sheets[0] || null);
      setVerified(Boolean(context.verified));
      setLive((current) => current ? { ...current, rules: ruleResponse.data || context.rules } : current);
      setPendingCount(readQueue(`pitchline:live-pending:${fixtureId}`).length);
    } catch {
      setNotice('Could not load the selected live match.');
    }
  };

  useEffect(() => {
    void loadFixtures();
    const connection = ws.connect();
    connectionRef.current = connection;
    connection.onMessage((message: any) => {
      if (message?.type !== 'entity.update') return;
      const entity = message.payload?.entity_type;
      const data = message.payload?.data;
      if (entity === 'live-match' && data?.fixtureId === selectedId) setLive(data);
      if (entity === 'fixtures' && Array.isArray(data)) setFixtures(data);
    });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      connection.disconnect();
      connectionRef.current = null;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMatch(selectedId);
    const subscribe = async () => {
      const connection = connectionRef.current;
      if (!connection) return;
      await connection.ready.catch(() => undefined);
      if (connection.connectionId) {
        await api.post('/api/subscriptions', { entity_type: 'live-match', entity_id: selectedId, connection_id: connection.connectionId }).catch(() => undefined);
      }
    };
    void subscribe();
  }, [selectedId]);

  useEffect(() => {
    const flush = async () => {
      if (!queueKey || !live || live.status !== 'Live' || !canManage) return;
      const queued = readQueue(queueKey);
      if (!queued.length) return;
      const remaining: PendingEvent[] = [];
      for (const item of queued) {
        try {
          const response = await api.post('/api/live-match/events-v2', item);
          setLive(response.data);
        } catch {
          remaining.push(item);
        }
      }
      if (remaining.length) localStorage.setItem(queueKey, JSON.stringify(remaining));
      else localStorage.removeItem(queueKey);
      setPendingCount(remaining.length);
    };
    void flush();
  }, [queueKey, live?.status, canManage]);

  const selected = fixtures.find((fixture) => fixture.id === selectedId) || fixtures[0];
  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selectedId, selected?.id]);

  const homePlayers = useMemo(() => players.filter((player) => normalizeTeam(player.team) === normalizeTeam(selected?.home)), [players, selected?.home]);
  const awayPlayers = useMemo(() => players.filter((player) => normalizeTeam(player.team) === normalizeTeam(selected?.away)), [players, selected?.away]);
  const quickPlayers = normalizeTeam(quickTeam) === normalizeTeam(selected?.home) ? homePlayers : normalizeTeam(quickTeam) === normalizeTeam(selected?.away) ? awayPlayers : [];
  const starters = new Set(teamSheet?.starters || []);
  const substitutes = new Set(teamSheet?.substitutes || []);
  const offPlayers = quickPlayers.filter((player) => starters.has(player.memberRef));
  const onPlayers = quickPlayers.filter((player) => substitutes.has(player.memberRef));

  const elapsed = live?.status === 'Live' && live.startedAt
    ? live.elapsedSeconds + Math.max(0, Math.floor((now - live.startedAt) / 1000))
    : live?.elapsedSeconds || 0;
  const minute = Math.floor(elapsed / 60) + 1;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const allowed = live?.rules?.allowedEvents || events.map((event) => event.type);
  const timeline = useMemo(() => {
    const rows = [...(live?.events || [])].sort((a, b) => b.createdAt - a.createdAt);
    return eventFilter === 'All' ? rows : rows.filter((row) => row.type === eventFilter);
  }, [live?.events, eventFilter]);

  const resetQuick = () => {
    setQuickType('');
    setQuickTeam('');
    setQuickPlayer('');
    setQuickOff('');
    setQuickOn('');
  };

  const chooseEvent = (type: string) => {
    setQuickType(type);
    setQuickPlayer('');
    setQuickOff('');
    setQuickOn('');
    setQuickTeam(['Goal', 'Yellow card', 'Red card', 'Substitution'].includes(type) ? '' : selected?.home || '');
  };

  const submitEvent = async () => {
    if (!selected || !live || live.status !== 'Live' || !quickType) return;
    if (['Goal', 'Yellow card', 'Red card'].includes(quickType) && (!quickTeam || !quickPlayer)) {
      setNotice('Select the team and player.');
      return;
    }
    if (['Offside', 'Corner', 'Injury'].includes(quickType) && !quickTeam) {
      setNotice('Select the team.');
      return;
    }
    if (quickType === 'Substitution' && (!quickTeam || !quickOff || !quickOn || quickOff === quickOn)) {
      setNotice('Select the team, player off and player on.');
      return;
    }
    const payload: PendingEvent = {
      fixtureId: selected.id,
      type: quickType,
      team: quickTeam || undefined,
      player: quickPlayer || undefined,
      minute,
      clockSeconds: elapsed,
      playerOffRef: quickType === 'Substitution' ? quickOff : undefined,
      playerOnRef: quickType === 'Substitution' ? quickOn : undefined
    };
    setBusy(true);
    try {
      const response = await api.post('/api/live-match/events-v2', payload);
      setLive(response.data);
      setNotice(`${quickType} published at ${minute}'`);
      resetQuick();
    } catch {
      if (queueKey) {
        const queue = readQueue(queueKey);
        queue.push(payload);
        localStorage.setItem(queueKey, JSON.stringify(queue));
        setPendingCount(queue.length);
        setNotice('Network unavailable. The event is queued and will sync automatically.');
        resetQuick();
      } else {
        setNotice('Could not record the event.');
      }
    } finally {
      setBusy(false);
    }
  };

  const changeMatch = async (path: string, extra: Record<string, unknown> = {}) => {
    if (!selected || !canManage) return;
    setBusy(true);
    try {
      const response = await api.post(path, { fixtureId: selected.id, ...extra });
      setLive(response.data);
      setNotice('Match state published.');
    } catch (error) {
      const failure = error as Error & { code?: string; status?: number; requestId?: string };
      const detail = [failure.message, failure.code ? `code: ${failure.code}` : '', failure.requestId ? `request: ${failure.requestId}` : ''].filter(Boolean).join(' · ');
      setNotice(detail || 'Could not update match state.');
      if (path === '/api/live-match/start' && failure.status === 409) {
        await loadMatch(selected.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!selected || !canManage || verified) return;
    setBusy(true);
    try {
      const response = await api.post('/api/live-match/undo', { fixtureId: selected.id });
      setLive(response.data);
      setNotice('Last live event reversed; audit entry retained.');
    } catch {
      setNotice('Could not reverse the last event.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post('/api/live-match/verify', { fixtureId: selected.id });
      setVerified(true);
      setNotice('Official match record verified and locked.');
    } catch {
      setNotice('Could not verify the match.');
    } finally {
      setBusy(false);
    }
  };

  if (!selected) {
    return <><section className='page-header'><div><p className='eyebrow'>PITCHLINE · LIVE MATCH</p><h1>Live Match</h1><p className='muted'>Select a fixture to open the live match centre.</p></div></section><div className='card'><div className='live-selector'><label className='label'>MATCH</label><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value=''>Select fixture</option>{fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home} vs {fixture.away} · {fixture.date} {fixture.time}</option>)}</select><button className='ghost' onClick={() => void loadFixtures()}><RefreshCw size={14}/>Refresh</button></div></div></>;
  }

  return <>
    <section className='page-header'>
      <div><p className='eyebrow'>PITCHLINE · LIVE MATCH</p><h1>Live Match</h1><p className='muted'>Fast one-tap matchday event entry, realtime updates, automatic timestamps and official verification.</p></div>
      <span className={`status ${live?.status === 'Live' ? 'blue' : live?.status === 'Full time' ? 'green' : 'amber'}`}><Clock3 size={13}/>{live?.status || 'Scheduled'}</span>
    </section>

    <div className='live-layout'>
      <div className='card live-main'>
        <div className='live-selector'>
          <label className='label'>MATCH</label>
          <select value={selected.id} onChange={(event) => { setSelectedId(event.target.value); resetQuick(); }}>
            {fixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home} vs {fixture.away} · {fixture.date} {fixture.time}</option>)}
          </select>
          <button className='ghost small' onClick={() => void loadMatch(selected.id)}><RefreshCw size={14}/>Refresh</button>
        </div>

        <div className='scoreboard'>
          <div><span>{selected.home}</span><strong>{live?.homeScore ?? selected.homeScore ?? 0}</strong></div>
          <div className='live-clock'><span className={live?.status === 'Live' ? 'pulse' : ''}>{clock}</span><small>{live?.status || 'Scheduled'}</small></div>
          <div><strong>{live?.awayScore ?? selected.awayScore ?? 0}</strong><span>{selected.away}</span></div>
        </div>

        <div className='match-meta'>
          <span><Clock3 size={14}/>{selected.date} · {selected.time}</span>
          <span><Users size={14}/>{live?.events?.length || 0} events</span>
          {live?.rules && <span><Flag size={14}/>{live.rules.ageGroup} rules</span>}
          {pendingCount > 0 && <span><WifiOff size={14}/>{pendingCount} pending sync</span>}
          {verified && <span><CheckCircle2 size={14}/>Verified</span>}
        </div>

        {canManage && <div className='live-controls'>
          <button className='primary' disabled={busy || live?.status === 'Live' || live?.status === 'Full time'} onClick={() => void changeMatch('/api/live-match/start')}><Play size={15}/>Start Match</button>
          <button className='ghost' disabled={busy || live?.status !== 'Live'} onClick={() => void changeMatch('/api/live-match/pause', { status: 'Half time' })}><Pause size={15}/>Half Time</button>
          <button className='ghost' disabled={busy || (live?.status !== 'Half time' && live?.status !== 'Paused')} onClick={() => void changeMatch('/api/live-match/resume')}><Play size={15}/>Second Half</button>
          <button className='danger-btn' disabled={busy || !live || live.status === 'Full time'} onClick={() => void changeMatch('/api/live-match/finish')}><CircleStop size={15}/>Full Time</button>
        </div>}

        {canManage && live?.status === 'Live' && <div className='quick-event-panel'>
          <div className='quick-event-title'><div><span className='label'>LIVE CONTROLS</span><h2>Tap an event</h2></div><span className='status blue'>{clock}</span></div>
          <div className='quick-event-grid'>
            {events.filter((event) => allowed.includes(event.type)).map((event) => {
              const Icon = event.icon;
              return <button key={event.type} className={`quick-event ${event.accent}`} disabled={busy} onClick={() => chooseEvent(event.type)}><Icon size={24}/><span>{event.label}</span></button>;
            })}
          </div>

          {quickType && <div className='quick-step-card'>
            <div className='quick-step-head'><b>{quickType}</b><button className='ghost small' onClick={resetQuick}>Cancel</button></div>
            <span className='step-label'>1 · TEAM</span>
            <div className='team-tap-row'><button className={`team-tap ${quickTeam === selected.home ? 'selected' : ''}`} onClick={() => { setQuickTeam(selected.home); setQuickPlayer(''); }}>{selected.home}</button><button className={`team-tap ${quickTeam === selected.away ? 'selected' : ''}`} onClick={() => { setQuickTeam(selected.away); setQuickPlayer(''); }}>{selected.away}</button></div>

            {['Goal', 'Yellow card', 'Red card'].includes(quickType) && <><span className='step-label'>2 · PLAYER / GOALSCORER</span>{quickPlayers.length ? <div className='player-tap-grid'>{quickPlayers.map((player) => <button type='button' key={player.memberRef} className={`player-tap ${quickPlayer === player.memberRef ? 'selected' : ''}`} onClick={() => setQuickPlayer(player.memberRef)}><b>{player.number}</b><span>{player.name}</span></button>)}</div> : <div className='empty-state'><h3>No registered players found for {quickTeam || 'this team'}</h3><p>Register the team players first, then return to the live match.</p></div>}</>}

            {quickType === 'Substitution' && <div className='admin-grid'><div><span className='step-label'>2 · OFF</span><select value={quickOff} onChange={(event) => setQuickOff(event.target.value)}><option value=''>Player off</option>{(offPlayers.length ? offPlayers : quickPlayers).map((player) => <option key={player.memberRef} value={player.memberRef}>{player.number} · {player.name}</option>)}</select></div><div><span className='step-label'>3 · ON</span><select value={quickOn} onChange={(event) => setQuickOn(event.target.value)}><option value=''>Player on</option>{(onPlayers.length ? onPlayers : quickPlayers).map((player) => <option key={player.memberRef} value={player.memberRef}>{player.number} · {player.name}</option>)}</select></div></div>}

            <button className='primary quick-confirm' disabled={busy} onClick={() => void submitEvent()}><CheckCircle2 size={17}/>Confirm {quickType}</button>
          </div>}

          <div className='quick-footer-actions'><button className='ghost' disabled={busy || verified || !(live.events?.length)} onClick={() => void undo()}><Undo2 size={15}/>Undo Last Event</button><span className='muted small'>Large controls are designed for fast one-handed use.</span></div>
        </div>}

        {live?.status === 'Live' && <div className='live-banner'><span className='live-dot'/>LIVE — published updates are visible to authorised viewers in realtime.</div>}
      </div>

      <div className='card live-timeline'>
        <div className='card-head'><div><span className='label'>OFFICIAL TIMELINE</span><h2>Match events</h2></div><select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option>All</option>{events.map((event) => <option key={event.type}>{event.type}</option>)}<option>Kick-off</option><option>Half time</option><option>Second half</option><option>Full time</option></select></div>
        {timeline.map((event) => <div className='live-event-row' key={event.id}><span className='event-minute'>{event.minute}'</span><span className='event-icon'>{event.type === 'Goal' ? <Goal size={16}/> : event.type === 'Yellow card' || event.type === 'Red card' ? <Square size={15}/> : event.type === 'Offside' ? <Flag size={15}/> : event.type === 'Substitution' ? <Users size={15}/> : event.type === 'Injury' ? <AlertTriangle size={15}/> : event.type === 'Corner' ? <CornerUpRight size={15}/> : <Clock3 size={15}/>}</span><div><b>{event.type}{event.player ? ` · ${event.player}` : ''}</b><small>{event.team || 'Official'}{event.playerOffRef ? ` · OFF ${event.playerOffRef}` : ''}{event.playerOnRef ? ` · ON ${event.playerOnRef}` : ''}</small></div><time>{new Date(event.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>)}
        {!timeline.length && <div className='empty-state'><h3>No events recorded</h3><p>Live events appear here with their match minute and system timestamp.</p></div>}
      </div>
    </div>

    <div className='card'>
      <div className='card-head'><div><span className='label'>OFFICIAL RECORD</span><h2>Verification</h2></div><Shield size={19}/></div>
      <div className='admin-grid'><div><b>{verified ? 'Verified and locked' : 'Awaiting verification'}</b><p className='muted small'>{verified ? 'The final event ledger is locked as an official record.' : 'After full time, the LFA administrator can verify the final record.'}</p></div><button className='primary' disabled={!canManage || busy || live?.status !== 'Full time' || verified} onClick={() => void verify()}><CheckCircle2 size={15}/>Verify Final Record</button></div>
    </div>
  </>;
}
