import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ws } from '@appdeploy/client';
import { AlertTriangle, ClipboardCheck, Clock3, FileCheck2, RefreshCw, Shield, UserCheck } from 'lucide-react';

type Role = 'Supporter' | 'Manager' | 'Club' | 'LFA Admin';
type Governance = {
  version: string;
  role: Role;
  summary: { ready: number; attention: number; escalated: number; overdue: number; openCases: number };
  compliance: Array<{ playerId: string; team: string; clubId?: string; consent: string; documents: string; expiryState: string; ownerRole: string }>;
  escalations: Array<{ id: string; playerId: string; severity: string; status: string; ownerRole: string; reason: string; createdAt: number }>;
  officers: Array<{ scopeType: string; scopeId: string; ownerRole: string; active: boolean }>;
  audit: Array<{ id: string; action: string; targetType: string; targetId: string; role: string; createdAt: number }>;
  permissions: string[];
};

export default function ComplianceGovernance({ setNotice }: { setNotice: (value: string) => void }) {
  const [data, setData] = useState<Governance | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [severity, setSeverity] = useState('High');
  const [reason, setReason] = useState('');
  const connRef = useRef<ReturnType<typeof ws.connect> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/compliance-governance');
      setData(res.data as Governance);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not load governance workspace');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const conn = ws.connect();
    connRef.current = conn;
    const handler = (message: any) => {
      if (message?.type === 'entity.update' && message?.payload?.entity_type === 'compliance-governance') {
        void load();
      }
    };
    conn.onMessage(handler);
    void conn.ready.then(() => {
      if (conn.connectionId) return api.post('/api/subscriptions', { entity_type: 'compliance-governance', entity_id: 'league', connection_id: conn.connectionId });
      return undefined;
    });
    return () => {
      if (conn.connectionId) void api.post('/api/subscriptions/remove', { entity_type: 'compliance-governance', entity_id: 'league', connection_id: conn.connectionId });
      conn.disconnect();
      connRef.current = null;
    };
  }, []);

  const canEscalate = data?.permissions.includes('escalations.manage') ?? false;
  const canAssign = data?.permissions.includes('officer.manage') ?? false;
  const attention = useMemo(() => data?.compliance.filter(x => x.expiryState !== 'Current' || x.consent !== 'Ready' || x.documents !== 'Ready') ?? [], [data]);

  const escalate = async () => {
    if (!selected || !reason.trim()) { setNotice('Select a player and enter a concise factual reason'); return; }
    try {
      await api.post('/api/compliance-governance/escalations', { playerId: selected, severity, reason: reason.trim() });
      setReason(''); setSelected(''); setNotice('Compliance escalation opened'); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not open escalation'); }
  };

  const assignOfficer = async (scopeId: string) => {
    try {
      await api.post('/api/compliance-governance/officers', { scopeType: data?.role === 'LFA Admin' ? 'league' : 'club', scopeId, ownerRole: data?.role });
      setNotice('Safeguarding ownership recorded'); await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not record ownership'); }
  };

  if (loading && !data) return <div className='card'><p>Loading governance controls…</p></div>;
  if (!data) return <div className='card'><p>Governance data unavailable.</p></div>;

  return <>
    <section className='hero-row'><div><p className='eyebrow'>LEAGUE GOVERNANCE 15.0</p><h1>Safeguarding & Compliance Governance</h1><p className='muted'>Monitor readiness, ownership, expiry risk and controlled escalations without exposing unnecessary youth or family data.</p></div><button className='primary' onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></section>
    <section className='stats-grid'>
      <div className='card stat'><div className='stat-icon'><Shield/></div><div><span>Ready</span><strong>{data.summary.ready}</strong><small>compliance records</small></div></div>
      <div className='card stat'><div className='stat-icon'><AlertTriangle/></div><div><span>Attention</span><strong>{data.summary.attention}</strong><small>requires review</small></div></div>
      <div className='card stat'><div className='stat-icon'><Clock3/></div><div><span>Overdue</span><strong>{data.summary.overdue}</strong><small>expired or overdue</small></div></div>
      <div className='card stat'><div className='stat-icon'><FileCheck2/></div><div><span>Escalated</span><strong>{data.summary.escalated}</strong><small>open escalations</small></div></div>
    </section>
    <section className='dashboard-grid'>
      <div className='card'><div className='card-head'><div><span className='label'>COMPLIANCE REGISTER</span><h2>Priority review</h2></div><ClipboardCheck size={19}/></div>
        {attention.length===0 ? <p className='muted'>No compliance exceptions in your scope.</p> : attention.map(item=><div className='mini-row' key={item.playerId}><span className='rank'><AlertTriangle size={14}/></span><b>{item.playerId}</b><span>{item.team}</span><strong>{item.expiryState}</strong></div>)}
      </div>
      <div className='card'><div className='card-head'><div><span className='label'>ESCALATION CONTROL</span><h2>Controlled escalation</h2></div><AlertTriangle size={19}/></div>
        {canEscalate ? <><select value={selected} onChange={e=>setSelected(e.target.value)}><option value=''>Select demo player</option>{data.compliance.map(p=><option key={p.playerId} value={p.playerId}>{p.playerId} · {p.team}</option>)}</select><select value={severity} onChange={e=>setSeverity(e.target.value)}><option>Medium</option><option>High</option><option>Critical</option></select><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} placeholder='Minimal factual reason; do not enter sensitive detail.'/><button className='primary' onClick={()=>void escalate()}>Open escalation</button></> : <p className='muted'>Your role can review escalation status but cannot create or change escalations.</p>}
      </div>
    </section>
    <section className='dashboard-grid'>
      <div className='card'><div className='card-head'><div><span className='label'>ESCALATION QUEUE</span><h2>Open governance issues</h2></div></div>{data.escalations.length===0?<p className='muted'>No open escalations.</p>:data.escalations.map(e=><div className='mini-row' key={e.id}><span className='rank'>{e.severity[0]}</span><b>{e.playerId}</b><span>{e.reason}</span><strong>{e.status}</strong></div>)}</div>
      <div className='card'><div className='card-head'><div><span className='label'>OWNERSHIP</span><h2>Safeguarding officers</h2></div><UserCheck size={19}/></div>{data.officers.length===0?<p className='muted'>No ownership record in scope.</p>:data.officers.map((o,i)=><div className='mini-row' key={`${o.scopeType}-${o.scopeId}-${i}`}><b>{o.scopeType}</b><span>{o.scopeId}</span><strong>{o.ownerRole}</strong></div>)}{canAssign&&<button className='text-btn' onClick={()=>void assignOfficer(data.role==='LFA Admin'?'league':(data.compliance[0]?.clubId||'club'))}>Record current scope ownership <UserCheck size={15}/></button>}</div>
    </section>
    <section className='card'><div className='card-head'><div><span className='label'>AUDIT GOVERNANCE</span><h2>Recent controlled actions</h2></div></div>{data.audit.length===0?<p className='muted'>No controlled actions recorded.</p>:data.audit.map(a=><div className='mini-row' key={a.id}><b>{a.action}</b><span>{a.targetType}</span><span>{a.role}</span><small>{a.createdAt?new Date(a.createdAt).toLocaleString('en-ZA'):''}</small></div>)}</section>
  </>;
}
