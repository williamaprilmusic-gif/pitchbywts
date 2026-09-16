import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Building2, Check, ChevronRight, ClipboardCheck, FileDown, GitBranch, LockKeyhole, RefreshCw, Settings2, ShieldCheck, Trophy, Users, X } from 'lucide-react';

type Role = 'Supporter' | 'Manager' | 'Club' | 'LFA Admin';
type Row = Record<string, unknown>;

const roles: Role[] = ['Supporter', 'Manager', 'Club', 'LFA Admin'];
const permissionRows = ['View fixtures', 'Manage team sheets', 'Capture live events', 'Approve registrations', 'Manage finance', 'Publish results', 'Manage competitions', 'View audit trail'];
const permissionMatrix: Record<string, Role[]> = {
  'View fixtures': roles,
  'Manage team sheets': ['Manager', 'Club', 'LFA Admin'],
  'Capture live events': ['Manager', 'Club', 'LFA Admin'],
  'Approve registrations': ['Club', 'LFA Admin'],
  'Manage finance': ['Club', 'LFA Admin'],
  'Publish results': ['LFA Admin'],
  'Manage competitions': ['LFA Admin'],
  'View audit trail': ['LFA Admin']
};

const nav: Record<string, string> = {
  league: 'League Office',
  registration: 'Club Registration',
  competition: 'Competition Engine',
  communications: 'Communications',
  'access-management': 'Access & Settings'
};

const norm = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function go(target: string) {
  const label = nav[target];
  if (!label) return;
  const match = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-item')).find((item) => norm(item.textContent).startsWith(norm(label)));
  match?.click();
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 400);
}

export default function OperationsWorkbench() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'governance' | 'onboarding' | 'competition' | 'notifications'>('governance');
  const [role, setRole] = useState<Role>('Supporter');
  const [registrations, setRegistrations] = useState<Row[]>([]);
  const [teams, setTeams] = useState<Row[]>([]);
  const [fixtures, setFixtures] = useState<Row[]>([]);
  const [communications, setCommunications] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const toast = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2500);
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const paths = ['/api/registrations', '/api/teams', '/api/fixtures', '/api/communications', '/api/my-role'];
      const responses = await Promise.all(paths.map((path) => fetch(path, { credentials: 'include', cache: 'no-store' })));
      const values = await Promise.all(responses.map((response) => response.json().catch(() => null)));
      const rows = (value: any): Row[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
      setRegistrations(rows(values[0]));
      setTeams(rows(values[1]));
      setFixtures(rows(values[2]));
      setCommunications(rows(values[3]));
      if (roles.includes(values[4]?.role)) setRole(values[4].role);
    } catch {
      toast('Live operations data could not be refreshed.');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onboarding = useMemo(() => ({
    pending: registrations.filter((row) => norm(row.status) === 'pending').length,
    approved: registrations.filter((row) => norm(row.status) === 'approved').length,
    teamCount: teams.length,
    fixtureCount: fixtures.length
  }), [registrations, teams, fixtures]);

  const unreadLike = useMemo(() => communications.filter((row) => norm(row.priority) === 'urgent' || norm(row.status) === 'unread').length, [communications]);

  const shell: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(9,21,15,.42)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '72px 12px 12px'
  };
  const panel: React.CSSProperties = {
    width: 'min(980px,100%)', maxHeight: 'calc(100vh - 84px)', overflow: 'auto', background: '#fff', border: '1px solid #dfe8e2', borderRadius: 16, boxShadow: '0 28px 90px rgba(14,30,22,.28)', color: '#26362e'
  };
  const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 11 };

  if (!open) return <button className="ops-workbench-trigger" onClick={() => setOpen(true)} aria-label="Open governance workbench"><Settings2 size={15} /><span>Operations</span></button>;

  return <>
    <div style={shell} onClick={() => setOpen(false)}>
      <section style={panel} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: 18, borderBottom: '1px solid #edf1ee' }}>
          <div><div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', color: '#7e8b84' }}>LEAGUE GOVERNANCE WORKBENCH</div><h2 style={{ margin: '5px 0', fontSize: 22 }}>Operations &amp; Control</h2><p style={{ margin: 0, fontSize: 11, color: '#748179' }}>Governance, onboarding, competition readiness and communications using live Pitchline records.</p></div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}><span style={{ padding: '7px 9px', borderRadius: 8, background: '#f3f7f4', fontSize: 10, fontWeight: 800 }}>{role}</span><button style={button} onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button></div>
        </header>

        <nav style={{ display: 'flex', gap: 4, padding: 8, borderBottom: '1px solid #edf1ee', overflowX: 'auto' }}>
          {([['governance', 'Permissions', LockKeyhole], ['onboarding', 'Onboarding', Building2], ['competition', 'Competition readiness', Trophy], ['notifications', 'Notifications', Bell]] as const).map(([key, label, Icon]) => <button key={key} style={{ ...button, background: tab === key ? '#eef6ec' : 'transparent', color: tab === key ? '#3d5d35' : '#718078', whiteSpace: 'nowrap' }} onClick={() => setTab(key)}><Icon size={14} /> {label}</button>)}
        </nav>

        <main style={{ padding: 16 }}>
          {tab === 'governance' && <div>
            <div style={{ padding: 12, border: '1px solid #e0e9e3', background: '#f7faf8', borderRadius: 10, fontSize: 10, color: '#66756d' }}><ShieldCheck size={15} /> Actions remain governed by API role enforcement. This workbench does not bypass server authorization.</div>
            <div style={{ marginTop: 12, border: '1px solid #e7ede9', borderRadius: 10, overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px,1.5fr) repeat(4,minmax(100px,1fr))', minWidth: 700, background: '#f7f9f8', fontSize: 9, fontWeight: 800 }}>{['Capability', ...roles].map((item) => <span key={item} style={{ padding: 10 }}>{item}</span>)}</div>
              {permissionRows.map((permission) => <div key={permission} style={{ display: 'grid', gridTemplateColumns: 'minmax(190px,1.5fr) repeat(4,minmax(100px,1fr))', minWidth: 700, borderTop: '1px solid #edf1ee', fontSize: 10 }}>{[<strong key="name">{permission}</strong>, ...roles.map((item) => <span key={item} style={{ textAlign: 'center', padding: 10 }}>{permissionMatrix[permission].includes(item) ? <Check size={14} /> : '—'}</span>)].map((item, index) => <span key={index} style={{ padding: 10 }}>{item}</span>)}</div>)}
            </div>
            {role === 'LFA Admin' && <button style={{ ...button, marginTop: 12, background: '#f4f8f2' }} onClick={() => { go('access-management'); setOpen(false); }}>Open Access &amp; Settings <ChevronRight size={14} /></button>}
          </div>}

          {tab === 'onboarding' && <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(120px,1fr))', gap: 8 }}>
              {[['Pending registrations', onboarding.pending], ['Approved registrations', onboarding.approved], ['Teams', onboarding.teamCount], ['Fixtures', onboarding.fixtureCount]].map(([label, value]) => <div key={String(label)} style={{ padding: 12, border: '1px solid #e7ede9', borderRadius: 10 }}><div style={{ fontSize: 9, color: '#87938c' }}>{label}</div><strong style={{ display: 'block', marginTop: 4, fontSize: 19 }}>{value}</strong></div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 12 }}>
              <article style={{ border: '1px solid #e7ede9', borderRadius: 11, padding: 13 }}><strong><ClipboardCheck size={15} /> Club onboarding control</strong><p style={{ fontSize: 10, color: '#7b8981', lineHeight: 1.5 }}>Use the real registration workflow to move a club through profile, teams, venue and acceptance.</p><button style={{ ...button, background: '#f4f8f2' }} onClick={() => { go('registration'); setOpen(false); }}>Open registrations <ChevronRight size={14} /></button></article>
              <article style={{ border: '1px solid #e7ede9', borderRadius: 11, padding: 13 }}><strong><Users size={15} /> Team setup</strong><p style={{ fontSize: 10, color: '#7b8981', lineHeight: 1.5 }}>Confirm approved registrations have an operational team and fixture pathway.</p><button style={{ ...button, background: '#f4f8f2' }} onClick={() => { go('league'); setOpen(false); }}>Open league office <ChevronRight size={14} /></button></article>
            </div>
            <button style={{ ...button, marginTop: 12, background: '#fff', border: '1px solid #dce6df' }} onClick={() => downloadJson(`pitchline-onboarding-${new Date().toISOString().slice(0, 10)}.json`, { generatedAt: new Date().toISOString(), role, summary: onboarding, registrations, teams, fixtures })}><FileDown size={14} /> Export onboarding control pack</button>
          </div>}

          {tab === 'competition' && <div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Readiness label="Competition structure" detail={teams.length ? `${teams.length} teams loaded from live data` : 'No live teams loaded'} ready={teams.length > 0} icon={<GitBranch size={16} />} />
              <Readiness label="Fixture programme" detail={fixtures.length ? `${fixtures.length} fixtures loaded` : 'No live fixtures loaded'} ready={fixtures.length > 0} icon={<Trophy size={16} />} />
              <Readiness label="Fixture completeness" detail={fixtures.length ? `${fixtures.filter((row) => !row.home || !row.away).length} incomplete records` : 'Awaiting fixtures'} ready={fixtures.length > 0 && fixtures.every((row) => row.home && row.away)} icon={<Check size={16} />} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 12 }}>
              <article style={{ border: '1px solid #e7ede9', borderRadius: 11, padding: 13 }}><strong><GitBranch size={15} /> Competition control</strong><p style={{ fontSize: 10, color: '#7b8981' }}>Open the existing competition engine for divisions, groups and programme generation.</p><button style={{ ...button, background: '#f4f8f2' }} onClick={() => { go('competition'); setOpen(false); }}>Open competition engine <ChevronRight size={14} /></button></article>
              <article style={{ border: '1px solid #e7ede9', borderRadius: 11, padding: 13 }}><strong><Trophy size={15} /> Reporting pack</strong><p style={{ fontSize: 10, color: '#7b8981' }}>Export the current competition inputs for administration and review.</p><button style={{ ...button, background: '#f4f8f2' }} onClick={() => downloadJson(`pitchline-competition-${new Date().toISOString().slice(0, 10)}.json`, { generatedAt: new Date().toISOString(), teams, fixtures })}><FileDown size={14} /> Download snapshot</button></article>
            </div>
          </div>}

          {tab === 'notifications' && <div>
            <div style={{ padding: 12, border: '1px solid #e0e9e3', background: '#f7faf8', borderRadius: 10, fontSize: 10 }}>{unreadLike ? `${unreadLike} high-priority or unread communication record(s) detected.` : 'No urgent/unread communication records detected.'}</div>
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{communications.slice(0, 12).map((row, index) => <button key={String(row.id ?? index)} style={{ ...button, display: 'flex', justifyContent: 'space-between', width: '100%', background: '#fff', border: '1px solid #e7ede9', textAlign: 'left' }} onClick={() => { go('communications'); setOpen(false); }}><span><strong>{String(row.title || row.subject || row.message || 'Communication')}</strong><br /><small>{String(row.audience || 'League audience')} · {String(row.status || '')}</small></span><ChevronRight size={14} /></button>)}{!communications.length && <div style={{ padding: 24, textAlign: 'center', color: '#8b9791', fontSize: 10 }}>No live communication records returned.</div>}</div>
          </div>}
        </main>

        <footer style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderTop: '1px solid #edf1ee', color: '#88958f', fontSize: 9 }}><span><RefreshCw size={12} /> {busy ? 'Refreshing…' : 'Live data workbench'}</span><button style={{ ...button, marginLeft: 'auto', background: 'transparent' }} onClick={() => void refresh()} disabled={busy}>Refresh</button></footer>
      </section>
    </div>
    {notice && <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 120, background: '#10221a', color: '#fff', borderRadius: 9, padding: '9px 12px', fontSize: 11 }}>{notice}</div>}
  </>;
}

function Readiness({ label, detail, ready, icon }: { label: string; detail: string; ready: boolean; icon: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 11, border: '1px solid #e7ede9', borderRadius: 10, color: ready ? '#4d965b' : '#b27845' }}><span>{icon}</span><div><strong style={{ display: 'block', color: '#35463d', fontSize: 10 }}>{label}</strong><span style={{ display: 'block', marginTop: 2, color: '#87938c', fontSize: 9 }}>{detail}</span></div></div>;
}
