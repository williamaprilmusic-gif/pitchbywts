import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bell, CheckCircle2, ChevronRight, CircleAlert, CloudOff, Command, Download, FileText, Filter, History, Keyboard, LayoutDashboard, ListChecks, Search, ShieldCheck, Smartphone, Trophy, Users, Wifi, X, Zap } from 'lucide-react';

type Role = 'Supporter' | 'Manager' | 'Club' | 'LFA Admin';
type Dataset = 'fixtures' | 'teams' | 'players' | 'registrations' | 'officials' | 'payments' | 'communications' | 'audit';
type Item = Record<string, unknown> & { id?: string | number };
type SearchResult = { kind: string; id: string; title: string; detail: string; target: string; item: Item };

const navLabels: Record<string, string> = {
  home: 'Dashboard', fixtures: 'Fixtures & Results', table: 'League Table', squad: 'Squad & Players', teams: 'Teams & Age Groups', matchday: 'Matchday', league: 'League Office', officials: 'Officials', discipline: 'Discipline', portal: 'My Portal', performance: 'Performance', intelligence: 'Club Intelligence', operations: 'League Operations', competition: 'Competition Engine', registration: 'Club Registration', finance: 'Finance', communications: 'Communications', reports: 'Reports', public: 'League Portal', scheduling: 'Scheduling', 'control-tower': 'Control Tower', 'matchday-command': 'Matchday Command', automation: 'Automation', predictive: 'Smart Insights', 'live-match': 'Live Match', 'access-management': 'Access & Settings', 'player-family-system': 'Players & Families', 'safeguarding-compliance': 'Safeguarding', 'compliance-governance': 'Compliance & Governance', 'executive-command': 'Executive Dashboard', 'workflow-automation': 'Workflows', 'competition-portfolio': 'Competition Portfolio', 'cross-competition': 'Competition Control', 'competition-operations': 'Competition Operations',
};

const actionRoles: Record<string, Role[]> = {
  'Start Match': ['LFA Admin'], 'Goal': ['Manager', 'Club', 'LFA Admin'], 'Card': ['Manager', 'Club', 'LFA Admin'], 'Substitution': ['Manager', 'Club', 'LFA Admin'], 'Half Time': ['LFA Admin'], 'Full Time': ['LFA Admin'], 'Undo': ['LFA Admin'], 'Publish Result': ['LFA Admin'],
};

const normalise = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const textOf = (item: Item) => Object.values(item).filter(value => ['string', 'number'].includes(typeof value)).join(' ');

function navigate(target: string) {
  const label = navLabels[target];
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-item')).find(node => normalise(node.textContent).startsWith(normalise(label || target)));
  if (button) { button.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else window.dispatchEvent(new CustomEvent('pitchline:notice', { detail: `${label || target} is not available in this workspace.` }));
}

function triggerAction(label: string) {
  const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  const wanted = normalise(label);
  const match = candidates.find(node => normalise(node.textContent) === wanted) || candidates.find(node => normalise(node.textContent).includes(wanted));
  if (match) { match.click(); return true; }
  window.dispatchEvent(new CustomEvent('pitchline:notice', { detail: `The ${label} control is not available for the selected match.` }));
  return false;
}

function downloadCsv(filename: string, rows: Item[]) {
  const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [keys.map(escape).join(','), ...rows.map(row => keys.map(key => escape(row[key])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

const emptyData: Record<Dataset, Item[]> = { fixtures: [], teams: [], players: [], registrations: [], officials: [], payments: [], communications: [], audit: [] };

export default function ProfessionalSuite() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'overview' | 'search' | 'matchday' | 'audit' | 'export' | 'integrity'>('overview');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role>('Supporter');
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [health, setHealth] = useState<'checking' | 'healthy' | 'degraded'>('checking');
  const [data, setData] = useState<Record<Dataset, Item[]>>(emptyData);
  const [audit, setAudit] = useState<Item[]>([]);
  const [toast, setToast] = useState('');
  const [lastSync, setLastSync] = useState(0);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<Array<{action: string; createdAt: number}>>(() => {
    try { return JSON.parse(localStorage.getItem('pitchline-offline-queue') || '[]'); } catch { return []; }
  });

  const showToast = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2200); }, []);

  const refresh = useCallback(async () => {
    setHealth('checking');
    const endpoints: Array<[Dataset, string]> = [
      ['fixtures', '/api/fixtures'], ['teams', '/api/teams'], ['players', '/api/players'], ['registrations', '/api/registrations'], ['officials', '/api/officials'], ['payments', '/api/payments'], ['communications', '/api/communications'],
    ];
    const entries = await Promise.all(endpoints.map(async ([key, endpoint]) => {
      try { const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store' }); if (!response.ok) return [key, []] as const; const body = await response.json(); return [key, Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : []] as const; } catch { return [key, []] as const; }
    }));
    setData(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    try { const response = await fetch('/api/_healthcheck', { credentials: 'include', cache: 'no-store' }); setHealth(response.ok ? 'healthy' : 'degraded'); } catch { setHealth('degraded'); }
    try { const response = await fetch('/api/my-role', { credentials: 'include', cache: 'no-store' }); if (response.ok) { const body = await response.json(); if (['Supporter','Manager','Club','LFA Admin'].includes(body?.role)) setRole(body.role); } } catch { /* public workspace */ }
    setLastSync(Date.now());
  }, []);

  useEffect(() => { refresh(); const onOnline = () => setOnline(true); const onOffline = () => setOnline(false); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); }; }, [refresh]);

  const loadAudit = async () => {
    if (role !== 'LFA Admin') { showToast('Audit history is restricted to LFA Admin.'); return; }
    try { const response = await fetch('/api/audit-log', { credentials: 'include', cache: 'no-store' }); if (!response.ok) throw new Error(); const body = await response.json(); setAudit(Array.isArray(body?.items) ? body.items : []); setMode('audit'); }
    catch { showToast('Audit history is currently unavailable.'); }
  };

  const results = useMemo<SearchResult[]>(() => {
    const q = normalise(query); if (!q) return [];
    const sources: Array<[Dataset, string, string]> = [['fixtures','fixtures','fixtures'],['teams','teams','teams'],['players','players','squad'],['registrations','registrations','registration'],['officials','officials','officials'],['payments','payments','finance'],['communications','communications','communications']];
    return sources.flatMap(([kind, label, target]) => data[kind].filter(item => normalise(textOf(item)).includes(q)).slice(0, 8).map(item => ({ kind: label, id: String(item.id ?? `${label}-${Math.random()}`), title: String(item.name || item.home || item.title || item.memberRef || item.id || label), detail: textOf(item).slice(0, 150), target, item })));
  }, [data, query]);

  const integrity = useMemo(() => {
    const fixtureIds = new Set(data.fixtures.map(row => String(row.id ?? '')));
    const teamNames = new Set(data.teams.map(row => normalise(row.name)));
    const orphanFixtures = data.fixtures.filter(row => row.home && row.away && (!teamNames.has(normalise(row.home)) || !teamNames.has(normalise(row.away)))).length;
    const orphanDiscipline = data.registrations.filter(row => row.id && !data.players.some(player => normalise(player.memberRef) === normalise(row.memberRef))).length;
    const duplicatePlayers = data.players.length - new Set(data.players.map(row => normalise(row.memberRef || row.id))).size;
    const invalidFixtureRefs = data.communications.filter(row => row.linkedType === 'fixture' && row.linkedId && !fixtureIds.has(String(row.linkedId))).length;
    return { orphanFixtures, orphanDiscipline, duplicatePlayers, invalidFixtureRefs };
  }, [data]);

  const startOfflineAction = (action: string) => {
    if (online) { triggerAction(action); return; }
    const next = [...offlineQueue, { action, createdAt: Date.now() }]; setOfflineQueue(next); localStorage.setItem('pitchline-offline-queue', JSON.stringify(next)); showToast(`${action} queued locally until connection returns.`);
  };

  useEffect(() => {
    if (!online || offlineQueue.length === 0) return;
    let cancelled = false;
    const flush = async () => {
      for (const item of offlineQueue) { if (cancelled) return; triggerAction(item.action); }
      if (!cancelled) { setOfflineQueue([]); localStorage.removeItem('pitchline-offline-queue'); showToast('Offline matchday actions restored to the live screen.'); }
    };
    void flush(); return () => { cancelled = true; };
  }, [online, offlineQueue.length, showToast]);

  if (!open) return <>
    <button className="pro-suite-trigger" onClick={() => setOpen(true)} aria-label="Open Pitchline professional control suite"><Zap size={15}/><span>Pro Tools</span></button>
    {!online && <div className="pro-offline-pill"><CloudOff size={13}/> Offline mode · {offlineQueue.length} queued</div>}
  </>;

  const actionButton = (label: string, icon: React.ReactNode) => {
    const allowed = actionRoles[label]?.includes(role) ?? false;
    return <button className="pro-action" disabled={!allowed} title={allowed ? `Run ${label}` : `${label} requires a higher role`} onClick={() => startOfflineAction(label)}>{icon}<span>{label}</span></button>;
  };

  return <>
    <div className="pro-suite-backdrop" onClick={() => setOpen(false)}>
      <section className="pro-suite" role="dialog" aria-modal="true" aria-label="Pitchline professional control suite" onClick={event => event.stopPropagation()}>
        <header className="pro-suite-head"><div><div className="pro-suite-kicker">PITCHLINE PROFESSIONAL CONTROL</div><h2>Operations Suite</h2><p>Real-data controls for matchday, governance, search and reporting.</p></div><div className="pro-head-actions"><span className={`pro-health ${health}`}><span className="pro-dot"/>{health === 'healthy' ? 'Systems healthy' : health === 'degraded' ? 'Service degraded' : 'Checking systems'}</span><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close professional suite"><X size={18}/></button></div></header>
        <nav className="pro-tabs"><button className={mode==='overview'?'active':''} onClick={() => setMode('overview')}><LayoutDashboard size={14}/>Overview</button><button className={mode==='search'?'active':''} onClick={() => setMode('search')}><Search size={14}/>Global search</button><button className={mode==='matchday'?'active':''} onClick={() => setMode('matchday')}><Smartphone size={14}/>Matchday mode</button><button className={mode==='integrity'?'active':''} onClick={() => setMode('integrity')}><ShieldCheck size={14}/>Data integrity</button><button className={mode==='export'?'active':''} onClick={() => setMode('export')}><Download size={14}/>Export centre</button><button className={mode==='audit'?'active':''} onClick={loadAudit}><History size={14}/>Audit trail</button></nav>
        <div className="pro-suite-body">
          {mode === 'overview' && <div className="pro-overview"><div className="pro-stat-grid"><div><span>Role</span><strong>{role}</strong></div><div><span>Connection</span><strong>{online ? 'Online' : 'Offline'}</strong></div><div><span>Queued actions</span><strong>{offlineQueue.length}</strong></div><div><span>Last sync</span><strong>{lastSync ? new Date(lastSync).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</strong></div></div><div className="pro-section-grid"><article><div className="pro-section-title"><Command size={15}/>Command shortcuts</div><div className="pro-actions-grid"><button className="pro-action" onClick={() => navigate('fixtures')}><Trophy size={16}/><span>Fixtures</span></button><button className="pro-action" onClick={() => navigate('squad')}><Users size={16}/><span>Players</span></button><button className="pro-action" onClick={() => navigate('reports')}><FileText size={16}/><span>Reports</span></button><button className="pro-action" onClick={() => navigate('communications')}><Bell size={16}/><span>Communications</span></button></div></article><article><div className="pro-section-title"><Keyboard size={15}/>Professional workflow</div><div className="pro-checklist"><span><CheckCircle2 size={14}/>Live match state control</span><span><CheckCircle2 size={14}/>Role-aware actions</span><span><CheckCircle2 size={14}/>Audit logging boundary</span><span><CheckCircle2 size={14}/>Offline-safe matchday queue</span><span><CheckCircle2 size={14}/>CSV export from live data</span></div></article></div></div>}
          {mode === 'search' && <div><div className="pro-search-box"><Search size={17}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search players, fixtures, teams, registrations, officials, finance…"/><Filter size={15}/></div><div className="pro-search-meta">{query ? `${results.length} matches from current live datasets` : 'Search across the records currently available to your role.'}</div><div className="pro-results">{results.map(result => <button key={`${result.kind}-${result.id}`} className="pro-result" onClick={() => { navigate(result.target); setOpen(false); }}><div><strong>{result.title}</strong><span>{result.kind} · {result.detail}</span></div><ChevronRight size={15}/></button>)}{query && !results.length && <div className="pro-empty">No matching live record found.</div>}</div></div>}
          {mode === 'matchday' && <div><div className="pro-match-banner"><div><span>Mobile-first matchday mode</span><strong>{online ? 'Live connection available' : 'Connection lost — actions queue locally'}</strong></div><Activity size={25}/></div><div className="pro-actions-grid match-actions">{actionButton('Start Match', <Activity size={18}/>)}{actionButton('Goal', <Trophy size={18}/>)}{actionButton('Card', <CircleAlert size={18}/>)}{actionButton('Substitution', <Users size={18}/>)}{actionButton('Half Time', <History size={18}/>)}{actionButton('Full Time', <CheckCircle2 size={18}/>)}{actionButton('Undo', <X size={18}/>)}</div><div className="pro-mini-note">The controls delegate to the live match workflow already present in Pitchline, so the suite does not create a second competing match state.</div></div>}
          {mode === 'integrity' && <div><div className="pro-integrity"><div className={integrity.orphanFixtures ? 'bad':'good'}><span>Fixture ↔ team links</span><strong>{integrity.orphanFixtures ? `${integrity.orphanFixtures} issue(s)` : 'Healthy'}</strong></div><div className={integrity.orphanDiscipline ? 'bad':'good'}><span>Registration ↔ player links</span><strong>{integrity.orphanDiscipline ? `${integrity.orphanDiscipline} issue(s)` : 'Healthy'}</strong></div><div className={integrity.duplicatePlayers ? 'bad':'good'}><span>Duplicate member references</span><strong>{integrity.duplicatePlayers ? `${integrity.duplicatePlayers} duplicate(s)` : 'None detected'}</strong></div><div className={integrity.invalidFixtureRefs ? 'bad':'good'}><span>Broken communication links</span><strong>{integrity.invalidFixtureRefs ? `${integrity.invalidFixtureRefs} issue(s)` : 'Healthy'}</strong></div></div><button className="pro-refresh" onClick={refresh}><Wifi size={14}/> Recheck live data</button></div>}
          {mode === 'export' && <div><div className="pro-export-grid">{(['fixtures','teams','players','registrations','officials','payments','communications'] as Dataset[]).map(key => <div className="pro-export-card" key={key}><div><strong>{key.replace(/(^|\s)\S/g, match => match.toUpperCase())}</strong><span>{data[key].length} live records</span></div><button onClick={() => data[key].length ? downloadCsv(`pitchline-${key}-${new Date().toISOString().slice(0,10)}.csv`, data[key]) : showToast(`No live ${key} records are available to export.`)}><Download size={14}/>CSV</button></div>)}</div><p className="pro-mini-note">Exports are generated from live records loaded from Pitchline APIs; no sample rows are inserted by the export tool.</p></div>}
          {mode === 'audit' && <div><div className="pro-search-meta">Latest governed mutations, newest first.</div><div className="pro-audit-list">{audit.map((row, index) => <div className="pro-audit-row" key={String(row.id ?? index)}><div><strong>{String(row.action || row.method || 'Mutation')}</strong><span>{String(row.path || '')} · {String(row.actorEmail || row.actorId || 'system')}</span></div><time>{row.createdAt ? new Date(Number(row.createdAt)).toLocaleString() : '—'}</time></div>)}{!audit.length && <div className="pro-empty">No audit records were returned.</div>}</div></div>}
        </div>
        <footer className="pro-suite-foot"><span><span className={`pro-dot ${online?'':'offline'}`}/>{online ? 'Online' : `Offline · ${offlineQueue.length} queued`}</span><span>Role: {role}</span><button onClick={refresh}><Wifi size={13}/> Refresh</button></footer>
      </section>
    </div>
    {toast && <div className="pitchline-mini-toast" role="status">{toast}</div>}
    {!online && <div className="pro-offline-pill"><CloudOff size={13}/> Offline mode · {offlineQueue.length} queued</div>}
    <style>{`
      .pro-suite-trigger{position:fixed;right:20px;top:17px;z-index:15;height:36px;display:flex;align-items:center;gap:7px;padding:0 12px;border:1px solid #cfddd5;border-radius:9px;background:#10221a;color:#fff;font:700 11px Inter,system-ui,sans-serif;box-shadow:0 8px 22px rgba(16,34,26,.18);cursor:pointer}.pro-suite-trigger:hover{transform:translateY(-1px)}
      .pro-suite-backdrop{position:fixed;inset:0;z-index:90;background:rgba(9,21,15,.46);display:flex;align-items:flex-start;justify-content:center;padding:76px 16px 16px}.pro-suite{width:min(1060px,100%);max-height:calc(100vh - 92px);overflow:hidden;background:#fff;border:1px solid #dce6e0;border-radius:18px;box-shadow:0 32px 100px rgba(12,26,19,.3);display:flex;flex-direction:column}.pro-suite-head{padding:18px 20px 14px;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #edf1ee}.pro-suite-kicker{font:800 9px Inter,system-ui,sans-serif;letter-spacing:.12em;color:#7c8a83}.pro-suite h2{margin:4px 0 4px;color:#1b2923;font:800 24px Inter,system-ui,sans-serif}.pro-suite p{margin:0;color:#75847c;font-size:11px}.pro-head-actions{display:flex;align-items:flex-start;gap:10px}.pro-health{display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:8px;background:#f6f8f7;color:#66756d;font-size:10px;font-weight:750}.pro-health.healthy{background:#eff8f0;color:#33703e}.pro-health.degraded{background:#fff6ed;color:#9a6230}.pro-dot{width:7px;height:7px;border-radius:999px;background:#91a39a;display:inline-block}.pro-health.healthy .pro-dot{background:#42a65b}.pro-health.degraded .pro-dot{background:#e09a4f}.pro-tabs{display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid #edf1ee;overflow:auto}.pro-tabs button{display:flex;align-items:center;gap:6px;padding:9px 10px;border:0;background:transparent;color:#6f7d76;border-radius:8px;font:750 10px Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer}.pro-tabs button.active,.pro-tabs button:hover{background:#f0f6ed;color:#3d5d35}.pro-suite-body{overflow:auto;padding:18px}.pro-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:16px}.pro-stat-grid>div{padding:12px;border:1px solid #e8eeea;border-radius:12px;background:#fbfcfb}.pro-stat-grid span{display:block;color:#89968f;font-size:9px;font-weight:700}.pro-stat-grid strong{display:block;color:#233229;margin-top:5px;font-size:14px}.pro-section-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pro-section-grid article{border:1px solid #e8eeea;border-radius:12px;padding:14px}.pro-section-title{display:flex;align-items:center;gap:7px;color:#33443b;font-size:11px;font-weight:800;margin-bottom:11px}.pro-actions-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pro-action{min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px solid #dfe8e2;border-radius:10px;background:#fff;color:#3c4b43;font:750 10px Inter,system-ui,sans-serif;cursor:pointer}.pro-action:hover:not(:disabled){background:#f4f8f2;border-color:#c8d7c3}.pro-action:disabled{opacity:.42;cursor:not-allowed}.pro-checklist{display:grid;gap:8px}.pro-checklist span{display:flex;align-items:center;gap:7px;color:#637169;font-size:10px}.pro-checklist svg{color:#59a566}.pro-search-box{display:flex;align-items:center;gap:8px;border:1px solid #dfe7e2;border-radius:11px;padding:0 11px}.pro-search-box input{width:100%;height:42px;border:0;outline:0;font:500 12px Inter,system-ui,sans-serif}.pro-search-meta{margin:9px 0;color:#8a9891;font-size:9px}.pro-results{display:grid;gap:6px}.pro-result{display:flex;align-items:center;justify-content:space-between;width:100%;padding:11px;border:1px solid #e6ece8;background:#fff;border-radius:10px;text-align:left;cursor:pointer}.pro-result:hover{background:#f6faf4}.pro-result strong,.pro-result span{display:block}.pro-result strong{color:#24342b;font-size:11px}.pro-result span{color:#7a8881;font-size:9px;margin-top:3px}.pro-empty{padding:26px;text-align:center;color:#88958f;font-size:11px}.pro-match-banner{display:flex;justify-content:space-between;align-items:center;border:1px solid #dae6dc;background:#f3f8f0;border-radius:12px;padding:15px;margin-bottom:12px;color:#49604f}.pro-match-banner span,.pro-match-banner strong{display:block}.pro-match-banner span{font-size:9px;font-weight:700}.pro-match-banner strong{font-size:13px;margin-top:3px}.match-actions .pro-action{min-height:88px}.pro-mini-note{margin:12px 0 0;color:#8a9791;font-size:9px;line-height:1.5}.pro-integrity{display:grid;gap:8px}.pro-integrity>div{display:flex;justify-content:space-between;gap:10px;padding:12px;border:1px solid #e8eeea;border-radius:10px}.pro-integrity span{font-size:10px;color:#66756d}.pro-integrity strong{font-size:10px}.pro-integrity .good strong{color:#438451}.pro-integrity .bad{background:#fff9f4;border-color:#f0dcc9}.pro-integrity .bad strong{color:#a46438}.pro-refresh{margin-top:12px;border:1px solid #dfe7e2;background:#fff;border-radius:9px;padding:8px 10px;font-size:10px;font-weight:750;cursor:pointer;display:flex;align-items:center;gap:6px}.pro-export-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.pro-export-card{display:flex;justify-content:space-between;align-items:center;border:1px solid #e8eeea;border-radius:11px;padding:11px}.pro-export-card strong,.pro-export-card span{display:block}.pro-export-card strong{font-size:11px;color:#27362e}.pro-export-card span{font-size:9px;color:#8b9791;margin-top:2px}.pro-export-card button{display:flex;align-items:center;gap:5px;border:1px solid #d8e2dc;background:#f8faf9;border-radius:8px;padding:7px 9px;font-size:9px;font-weight:800;cursor:pointer}.pro-audit-list{display:grid;gap:6px}.pro-audit-row{display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #e8eeea;border-radius:9px}.pro-audit-row strong,.pro-audit-row span{display:block}.pro-audit-row strong{font-size:10px;color:#304138}.pro-audit-row span,.pro-audit-row time{font-size:9px;color:#8a9790;margin-top:3px}.pro-suite-foot{display:flex;align-items:center;gap:14px;padding:10px 14px;border-top:1px solid #edf1ee;color:#8a9790;font-size:9px}.pro-suite-foot>span:first-child{display:flex;align-items:center;gap:6px}.pro-suite-foot button{margin-left:auto;border:0;background:transparent;color:#67766e;font-size:9px;font-weight:750;cursor:pointer}.pro-offline-pill{position:fixed;right:20px;bottom:18px;z-index:16;display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #f0dcc9;border-radius:9px;background:#fff9f4;color:#9a6230;font-size:9px;font-weight:800;box-shadow:0 8px 22px rgba(20,35,27,.12)}.pro-dot.offline{background:#e09a4f}.pitchline-mini-toast{position:fixed;right:18px;bottom:18px;z-index:120;background:#10221a;color:#fff;border-radius:9px;padding:9px 12px;font-size:11px;box-shadow:0 14px 35px rgba(16,34,26,.24)}
      @media(max-width:820px){.pro-suite-trigger{right:74px}.pro-suite-backdrop{padding:54px 8px 8px}.pro-suite{max-height:calc(100vh - 62px);border-radius:14px}.pro-suite-head{padding:14px}.pro-suite h2{font-size:20px}.pro-stat-grid{grid-template-columns:repeat(2,1fr)}.pro-section-grid{grid-template-columns:1fr}.pro-actions-grid{grid-template-columns:repeat(2,1fr)}.pro-suite-body{padding:12px}.pro-tabs{padding:7px}.pro-suite-foot{padding:9px}}
    `}</style>
  </>;
}
