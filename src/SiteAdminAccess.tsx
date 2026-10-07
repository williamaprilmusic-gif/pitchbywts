import { useState } from 'react';
import { api } from './platformClient';
import { Shield } from 'lucide-react';
import { useSiteOverview } from './SiteAdminCompetitions';

const WHY = 'Competition scoping is not enabled yet';

/** Site Admin only. The control stays disabled while the server flag TENANCY_ENFORCED is false (the route also answers 409). */
export default function SiteAdminAccess({ setNotice }: { setNotice: (v: string) => void }) {
  const { data, load } = useSiteOverview(setNotice);
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState('LFA Admin');
  const [ids, setIds] = useState<string[]>([]);
  const enabled = data.tenancyEnforced === true;
  const assign = async () => { try { await api.post('/api/admin/assign-competition-admin', { email, kind, competitionIds: ids }); setNotice('Competition admin assigned.'); setEmail(''); setIds([]); await load(); } catch (e) { setNotice(typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message) : 'Could not assign the admin.'); } };
  return <section className='card site-admin-card' aria-label='Site administration: competition admins'>
    <div className='card-head'><div><span className='label'>SITE ADMIN</span><h2>Assign a competition admin</h2></div><Shield size={19}/></div>
    <p className='muted' role='status'>{enabled ? 'Give an LFA or Tournament administrator access to specific competitions.' : `${WHY}. This control is disabled until competition-level access limits are switched on.`}</p>
    <div className='site-admin-edit'>
      <input aria-label='Administrator email' type='email' placeholder='Administrator email' value={email} disabled={!enabled} onChange={e => setEmail(e.target.value)}/>
      <select aria-label='Administrator kind' value={kind} disabled={!enabled} onChange={e => setKind(e.target.value)}><option>LFA Admin</option><option>Tournament Admin</option></select>
    </div>
    <div className='site-admin-checks'>{data.competitions.map(c => <label key={c.id}><input type='checkbox' disabled={!enabled} checked={ids.includes(c.id)} onChange={e => setIds(e.target.checked ? [...ids, c.id] : ids.filter(x => x !== c.id))}/> {c.name}</label>)}</div>
    <button className='primary' disabled={!enabled || !email.trim() || !ids.length} title={enabled ? undefined : WHY} onClick={() => void assign()}>Assign competition admin</button>
  </section>;
}
