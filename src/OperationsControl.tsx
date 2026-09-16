import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, ChevronRight, FileDown, LockKeyhole, RefreshCw, Settings2, ShieldCheck, Trophy, Users, X } from 'lucide-react';

type Role = 'Supporter' | 'Manager' | 'Club' | 'LFA Admin';
type Row = Record<string, unknown>;
const roles: Role[] = ['Supporter', 'Manager', 'Club', 'LFA Admin'];
const permissions: Array<[string, Role[]]> = [
  ['View fixtures', roles], ['Manage team sheets', ['Manager', 'Club', 'LFA Admin']],
  ['Capture live events', ['Manager', 'Club', 'LFA Admin']], ['Approve registrations', ['Club', 'LFA Admin']],
  ['Manage finance', ['Club', 'LFA Admin']], ['Publish results', ['LFA Admin']],
  ['Manage competitions', ['LFA Admin']], ['View audit trail', ['LFA Admin']]
];
const normalise = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const rowsOf = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : (value && typeof value === 'object' && Array.isArray((value as { items?: unknown[] }).items) ? (value as { items: Row[] }).items : []);
function go(label: string) { const wanted = normalise(label); const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-item')).find(item => normalise(item.textContent).startsWith(wanted)); button?.click(); }
function exportJson(filename: string, payload: unknown) { const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 500); }

export default function OperationsControl() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'governance' | 'onboarding' | 'competition' | 'notifications'>('governance');
  const [role, setRole] = useState<Role>('Supporter');
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [teams, setTeams] = useState<Row[]>([]);
  const [fixtures, setFixtures] = useState<Row[]>([]);
  const [communications, setCommunications] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const responses = await Promise.all(['/api/registrations', '/api/teams', '/api/fixtures', '/api/communications', '/api/my-role'].map(url => fetch(url, { credentials: 'include', cache: 'no-store' })));
      const bodies = await Promise.all(responses.map(response => response.ok ? response.json().catch(() => null) : null));
      setRegistrations(rowsOf(bodies[0])); setTeams(rowsOf(bodies[1])); setFixtures(rowsOf(bodies[2])); setCommunications(rowsOf(bodies[3]));
      const returnedRole = bodies[4] && typeof bodies[4] === 'object' ? (bodies[4] as { role?: Role }).role : undefined;
      if (returnedRole && roles.includes(returnedRole)) setRole(returnedRole);
    } catch { setError('Live operations data could not be refreshed.'); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  useEffect(() => {
    const onRefresh = () => { if (open) void refresh(); };
    window.addEventListener('pitchline:module-refresh', onRefresh);
    return () => window.removeEventListener('pitchline:module-refresh', onRefresh);
  }, [open, refresh]);

  const summary = useMemo(() => ({
    pending: registrations.filter(row => normalise(row.status) === 'pending').length,
    approved: registrations.filter(row => normalise(row.status) === 'approved').length,
    incompleteFixtures: fixtures.filter(row => !row.home || !row.away).length,
    urgent: communications.filter(row => normalise(row.priority) === 'urgent').length,
  }), [registrations, fixtures, communications]);

  if (!open) return <button className="ops-workbench-trigger" onClick={() => setOpen(true)} aria-label="Open operations control"><Settings2 size={15} /><span>Operations</span></button>;

  return <div className="ops-wb-backdrop" onClick={() => setOpen(false)}>
    <section className="ops-wb" role="dialog" aria-modal="true" aria-label="Pitchline operations control" onClick={event => event.stopPropagation()}>
      <header><div><span className="ops-eyebrow">PITCHLINE OPERATIONS CONTROL</span><h2>Connected Operations</h2><p>One control surface tied to the same live records used by the existing modules.</p></div><div className="ops-head-right"><span className="ops-role">{role}</span><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button></div></header>
      <nav className="ops-tabs">
        <button className={tab === 'governance' ? 'active' : ''} onClick={() => setTab('governance')}><LockKeyhole size={14} />Permissions</button>
        <button className={tab === 'onboarding' ? 'active' : ''} onClick={() => setTab('onboarding')}><Users size={14} />Onboarding</button>
        <button className={tab === 'competition' ? 'active' : ''} onClick={() => setTab('competition')}><Trophy size={14} />Competition readiness</button>
        <button className={tab === 'notifications' ? 'active' : ''} onClick={() => setTab('notifications')}><Bell size={14} />Notifications</button>
      </nav>
      <main>
        {error && <div className="ops-panel-note"><ShieldCheck size={15} />{error}</div>}
        {tab === 'governance' && <div><div className="ops-panel-note"><ShieldCheck size={15} /><span>Client controls mirror permissions; the API remains authoritative for authorization.</span></div><div className="ops-perm-table"><div className="ops-perm-head"><span>Capability</span>{roles.map(item => <span key={item}>{item}</span>)}</div>{permissions.map(([name, allowed]) => <div className="ops-perm-row" key={name}><strong>{name}</strong>{roles.map(item => <span key={item}>{allowed.includes(item) ? <Check size={14} /> : <span className="ops-dash">—</span>}</span>)}</div>)}</div>{role === 'LFA Admin' && <button className="ops-link" onClick={() => { go('Access & Settings'); setOpen(false); }}>Open Access & Settings <ChevronRight size={14} /></button>}</div>}
        {tab === 'onboarding' && <div><div className="ops-metrics"><div><span>Pending registrations</span><strong>{summary.pending}</strong></div><div><span>Approved registrations</span><strong>{summary.approved}</strong></div><div><span>Teams</span><strong>{teams.length}</strong></div><div><span>Fixtures</span><strong>{fixtures.length}</strong></div></div><div className="ops-onboard-grid"><article><h3>Club onboarding</h3><p>Work from the registration module, then confirm teams and fixture readiness before release.</p><button onClick={() => { go('Club Registration'); setOpen(false); }}>Open registrations <ChevronRight size={14} /></button></article><article><h3>Team and fixture setup</h3><p>{summary.incompleteFixtures ? `${summary.incompleteFixtures} fixture records need team data.` : 'No incomplete fixture pairings detected.'}</p><button onClick={() => { go('League Office'); setOpen(false); }}>Open league office <ChevronRight size={14} /></button></article></div><button className="ops-export" onClick={() => exportJson(`pitchline-onboarding-${new Date().toISOString().slice(0, 10)}.json`, { generatedAt: new Date().toISOString(), role, summary, registrations, teams, fixtures })}><FileDown size={14} />Export control pack</button></div>}
        {tab === 'competition' && <div><div className="ops-readiness"><div className={teams.length ? 'ready' : 'attention'}><Trophy size={16} /><div><strong>Teams loaded</strong><span>{teams.length ? `${teams.length} live team record(s)` : 'No live teams loaded'}</span></div></div><div className={fixtures.length ? 'ready' : 'attention'}><Trophy size={16} /><div><strong>Fixture programme</strong><span>{fixtures.length ? `${fixtures.length} live fixture record(s)` : 'No live fixtures loaded'}</span></div></div><div className={summary.incompleteFixtures === 0 && fixtures.length > 0 ? 'ready' : 'attention'}><Check size={16} /><div><strong>Fixture completeness</strong><span>{fixtures.length ? `${summary.incompleteFixtures} incomplete pairing(s)` : 'Awaiting fixture data'}</span></div></div></div><div className="ops-onboard-grid"><article><h3>Competition engine</h3><p>Use the existing competition module for actual structure and programme changes.</p><button onClick={() => { go('Competition Engine'); setOpen(false); }}>Open competition engine <ChevronRight size={14} /></button></article><article><h3>Operational snapshot</h3><p>Export the live inputs used for competition administration.</p><button onClick={() => exportJson(`pitchline-competition-${new Date().toISOString().slice(0, 10)}.json`, { generatedAt: new Date().toISOString(), teams, fixtures })}><FileDown size={14} />Download snapshot</button></article></div></div>}
        {tab === 'notifications' && <div><div className="ops-panel-note"><Bell size={15} /><span>{summary.urgent ? `${summary.urgent} urgent communication record(s) detected.` : 'No urgent communications are currently returned.'}</span></div><div className="ops-notifications">{communications.slice(0, 15).map((row, index) => <button key={String(row.id ?? index)} onClick={() => { go('Communications'); setOpen(false); }}><span className={normalise(row.priority) === 'urgent' ? 'urgent-dot' : 'normal-dot'} /><div><strong>{String(row.title || row.subject || row.message || 'Communication')}</strong><span>{String(row.audience || 'League audience')} · {String(row.status || '')}</span></div><ChevronRight size={14} /></button>)}{communications.length === 0 && <div className="ops-empty">No live communications returned.</div>}</div></div>}
      </main>
      <footer><span><RefreshCw size={12} />{busy ? 'Refreshing…' : 'Live operational data'}</span><button onClick={() => void refresh()} disabled={busy}>Refresh</button></footer>
    </section>
  </div>;
}
