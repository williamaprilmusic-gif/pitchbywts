import { useEffect, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { api } from './platformClient';
import { Crest, useBranding } from './branding';

const errorText = (error: unknown, fallback: string) => typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message || fallback) : fallback;

/** LFA Admin: league name, season and country (shown across the app). */
export function LeagueSettingsCard({ setNotice }: { setNotice: (value: string) => void }) {
  const { league, refresh } = useBranding();
  const [form, setForm] = useState(league);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(league); }, [league]);
  const save = async () => {
    if (!form.name.trim() || !form.season.trim()) { setNotice('League name and season are required.'); return; }
    setSaving(true);
    try { await api.put('/api/league-settings', form); await refresh(); setNotice('League settings saved.'); }
    catch (error) { setNotice(errorText(error, 'Could not save league settings.')); }
    finally { setSaving(false); }
  };
  return <div className='card admin-panel branding-card'>
    <span className='label'>LEAGUE SETTINGS</span><h2>League identity</h2>
    <p className='muted small'>Shown in the sidebar, league tables and match centre.</p>
    <div className='form-grid'>
      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder='League name' aria-label='League name' />
      <input value={form.season} onChange={e => setForm({ ...form, season: e.target.value })} placeholder='Season (e.g. 2026)' aria-label='Season' />
      <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder='Country / region' aria-label='Country or region' />
    </div>
    <button className='primary' disabled={saving} onClick={() => void save()}><Save size={15} />{saving ? 'Saving…' : 'Save league settings'}</button>
  </div>;
}

/** Resize an uploaded image to a small square PNG data URL for the crest. */
function resizeCrest(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not a readable image.'));
      image.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('Image processing is not available.')); return; }
        const scale = Math.min(size / image.width, size / image.height);
        const width = image.width * scale, height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL('image/png'));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** LFA Admin (any club) or Club administrator (own club): crest and colours. */
export function ClubBrandingCard({ role, ownClub, setNotice }: { role: string; ownClub?: string; setNotice: (value: string) => void }) {
  const { clubs, clubForTeam, refresh } = useBranding();
  const isAdmin = role === 'LFA Admin';
  const own = clubForTeam(ownClub);
  const [clubId, setClubId] = useState('');
  const club = clubs.find(c => c.id === clubId) || (isAdmin ? undefined : own);
  const [primaryColor, setPrimary] = useState('#1f7a3a');
  const [secondaryColor, setSecondary] = useState('#ffffff');
  const [crest, setCrest] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!isAdmin && own && !clubId) setClubId(own.id); }, [isAdmin, own, clubId]);
  useEffect(() => { if (club) { setPrimary(club.primaryColor || '#1f7a3a'); setSecondary(club.secondaryColor || '#ffffff'); setCrest(club.crest || ''); } }, [club?.id]);

  if (!isAdmin && !own) return <div className='card admin-panel branding-card'><span className='label'>CLUB IDENTITY</span><h2>Crest & colours</h2><p className='muted small'>Your account is not linked to a club yet, so club branding cannot be edited.</p></div>;

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setNotice('Choose an image smaller than 5 MB.'); return; }
    try { setCrest(await resizeCrest(file)); } catch (error) { setNotice(errorText(error, 'Could not use that image.')); }
  };
  const save = async () => {
    if (!club) { setNotice('Choose a club first.'); return; }
    setSaving(true);
    try { await api.put(`/api/clubs/${club.id}/branding`, { crest, primaryColor, secondaryColor }); await refresh(); setNotice(`${club.name} branding saved.`); }
    catch (error) { setNotice(errorText(error, 'Could not save club branding.')); }
    finally { setSaving(false); }
  };
  return <div className='card admin-panel branding-card'>
    <span className='label'>CLUB IDENTITY</span><h2>Crest & colours</h2>
    <p className='muted small'>Used on fixtures, league tables, the live scoreboard and the match centre.</p>
    {isAdmin && <select value={clubId} onChange={e => setClubId(e.target.value)} aria-label='Club'><option value=''>Choose a club</option>{clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
    {club && <>
      <div className='branding-preview'>
        {crest ? <img className='club-crest' src={crest} alt='' style={{ width: 64, height: 64 }} /> : <Crest team={club.name} size={64} />}
        <div><b>{club.name}</b><span className='swatches'><i style={{ background: primaryColor }} /><i style={{ background: secondaryColor }} /></span></div>
      </div>
      <div className='form-grid'>
        <label className='file-pick'><ImagePlus size={15} />Upload crest<input type='file' accept='image/png,image/jpeg,image/webp' onChange={e => void upload(e.target.files?.[0])} /></label>
        <label className='color-pick'>Primary<input type='color' value={primaryColor} onChange={e => setPrimary(e.target.value)} /></label>
        <label className='color-pick'>Secondary<input type='color' value={secondaryColor} onChange={e => setSecondary(e.target.value)} /></label>
      </div>
      <div className='action-row'>
        <button className='primary' disabled={saving} onClick={() => void save()}><Save size={15} />{saving ? 'Saving…' : 'Save branding'}</button>
        {crest && <button className='ghost' onClick={() => setCrest('')}><Trash2 size={15} />Remove crest</button>}
      </div>
    </>}
  </div>;
}
