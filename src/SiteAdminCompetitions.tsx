import { useEffect, useState } from 'react';
import { api } from './platformClient';
import { Link2, Shield } from 'lucide-react';

export type SiteCompetition = { id: string; name: string; kind: string; season: string; status: string; public: boolean; slug: string; clubs: Array<{ linkId: string; clubId: string; name: string }>; admins: Array<{ userId: string; role: string }> };
export type SiteOverview = { competitions: SiteCompetition[]; clubs: Array<{ id: string; name: string }>; tenancyEnforced: boolean };
const errText = (e: unknown, fallback: string) => (typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message) : fallback);

export function useSiteOverview(setNotice: (v: string) => void) {
  const [data, setData] = useState<SiteOverview>({ competitions: [], clubs: [], tenancyEnforced: false });
  const load = async () => { try { const r = await api.get<SiteOverview>('/api/admin/competitions'); if (r.data) setData(r.data); } catch { setNotice('Could not load the site-admin competition list.'); } };
  useEffect(() => { void load(); }, []);
  return { data, load };
}

/** Site Admin only (render gated by access.isSiteAdmin; the routes enforce it again server-side). */
export default function SiteAdminCompetitions({ setNotice }: { setNotice: (v: string) => void }) {
  const { data, load } = useSiteOverview(setNotice);
  const [editing, setEditing] = useState<{ id: string; name: string; season: string; slug: string } | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); await load(); setNotice(ok); } catch (e) { setNotice(errText(e, 'That change could not be saved.')); } finally { setBusy(false); } };
  return <section className='card site-admin-card' aria-label='Site administration: competitions'>
    <div className='card-head'><div><span className='label'>SITE ADMIN</span><h2>All competitions, clubs and admins</h2></div><Shield size={19}/></div>
    <p className='muted'>Only you can see this. Use Add competition above to create one, then set it public here so Supporters can pick it.</p>
    <div className='site-admin-list'>{data.competitions.map(c => {
      const linked = new Set(c.clubs.map(l => l.clubId));
      const free = data.clubs.filter(cl => !linked.has(cl.id));
      return <article className='site-admin-row' key={c.id}>
        <div className='site-admin-top'><div><b>{c.name}</b><small>{c.kind} · {c.season} · {c.status} · /{c.slug}</small></div><span className={`status ${c.public ? 'green' : 'amber'}`}>{c.public ? 'Public' : 'Hidden'}</span></div>
        {editing?.id === c.id ? <div className='site-admin-edit'>
          <input aria-label='Competition name' value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/>
          <input aria-label='Season' value={editing.season} onChange={e => setEditing({ ...editing, season: e.target.value })}/>
          <input aria-label='Slug' value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })}/>
          <button className='primary' disabled={busy} onClick={() => void run(async () => { await api.put(`/api/admin/competitions/${c.id}`, { name: editing.name, season: editing.season, slug: editing.slug }); setEditing(null); }, 'Competition saved.')}>Save</button>
          <button className='ghost' onClick={() => setEditing(null)}>Cancel</button>
        </div> : <div className='site-admin-actions'>
          <button className='ghost' onClick={() => setEditing({ id: c.id, name: c.name, season: c.season, slug: c.slug })}>Edit</button>
          <button className='ghost' disabled={busy} onClick={() => void run(() => api.put(`/api/admin/competitions/${c.id}`, { public: !c.public }), c.public ? 'Competition hidden from Supporters.' : 'Competition is now public.')}>{c.public ? 'Make hidden' : 'Make public'}</button>
        </div>}
        <div className='site-admin-links'><span className='label'><Link2 size={12}/> Clubs ({c.clubs.length})</span>
          {c.clubs.map(l => <span className='site-admin-chip' key={l.linkId}>{l.name}<button aria-label={`Unlink ${l.name}`} disabled={busy} onClick={() => void run(() => api.delete(`/api/club-competitions/${encodeURIComponent(l.linkId)}`), 'Club unlinked.')}>×</button></span>)}
          {!c.clubs.length && <small>No clubs linked yet.</small>}
          <div className='site-admin-edit'><select aria-label={`Club to link to ${c.name}`} value={pick[c.id] || ''} onChange={e => setPick({ ...pick, [c.id]: e.target.value })}><option value=''>Select club</option>{free.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}</select><button className='ghost' disabled={busy || !pick[c.id]} onClick={() => void run(async () => { await api.post('/api/club-competitions', { clubId: pick[c.id], competitionId: c.id }); setPick({ ...pick, [c.id]: '' }); }, 'Club linked.')}>Link club</button></div>
        </div>
        <small>Admins: {c.admins.length ? c.admins.map(a => `${a.role} (${a.userId})`).join(', ') : 'none assigned'}</small>
      </article>;
    })}{!data.competitions.length && <div className='empty-state'><h3>No competitions yet</h3><p>Create one with Add competition.</p></div>}</div>
  </section>;
}
