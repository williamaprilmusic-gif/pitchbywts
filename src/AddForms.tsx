import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from './platformClient';

type Team = { id: string; name: string; ageGroup: string };
const AGE_GROUPS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'Senior'];
const errorText = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/** Inline "Add team" form. Enter the club name once and tick the divisions; one team is created per division ("<name> <division>"). LFA Admin adds any team; a Club adds teams under its own club. */
export function AddTeamForm({ role, club, defaultAge, onClose, onAdded, setNotice }: { role: string; club?: string; defaultAge: string; onClose: () => void; onAdded: () => Promise<void>; setNotice: (v: string) => void }) {
  const [name, setName] = useState('');
  const [divisions, setDivisions] = useState<string[]>(() => [AGE_GROUPS.includes(defaultAge) ? defaultAge : 'U14']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A club adds teams under its own name: "<club> <age group>", matching how the league links teams to clubs.
  const clubBase = role === 'LFA Admin' ? '' : String(club || '').replace(/\s+FC$/i, '').trim();
  // Strip a trailing division the admin may have typed, so "Rovers U12" + U12 does not become "Rovers U12 U12".
  const baseName = clubBase || name.trim().replace(new RegExp(`\s+(?:${AGE_GROUPS.join('|')})$`, 'i'), '').trim();
  const nameFor = (division: string) => `${baseName} ${division}`;
  const ordered = AGE_GROUPS.filter(a => divisions.includes(a));
  const allSelected = ordered.length === AGE_GROUPS.length;
  const toggle = (division: string) => setDivisions(list => list.includes(division) ? list.filter(d => d !== division) : [...list, division]);
  const save = async () => {
    if (!baseName) { setError('Enter the team name, for example "Liverpool Portland".'); return; }
    if (!ordered.length) { setError('Select at least one division.'); return; }
    setError('');
    setBusy(true);
    const created: string[] = [];
    const skipped: string[] = [];
    const failed: { division: string; reason: string }[] = [];
    for (const division of ordered) {
      try {
        await api.post(role === 'LFA Admin' ? '/api/teams' : '/api/club-teams', { name: nameFor(division), ageGroup: division });
        created.push(division);
      } catch (e) {
        const reason = errorText(e, 'Could not add the team.');
        if (/already exists/i.test(reason)) skipped.push(division); else failed.push({ division, reason });
      }
    }
    try {
      if (created.length) await onAdded();
      if (!failed.length && !skipped.length) {
        setNotice(created.length === 1 ? `${nameFor(created[0])} added.` : `${created.length} teams added for ${baseName}: ${created.join(', ')}.`);
        setName('');
        onClose();
      } else {
        // Keep the form open, leaving only the divisions that still need attention ticked.
        setDivisions(ordered.filter(d => !created.includes(d)));
        const parts = [];
        if (created.length) parts.push(`Created: ${created.join(', ')}.`);
        if (skipped.length) parts.push(`Skipped, team already exists: ${skipped.map(nameFor).join(', ')}.`);
        if (failed.length) parts.push(`Failed: ${failed.map(f => `${f.division} (${f.reason})`).join('; ')}.`);
        setError(parts.join(' '));
        setNotice(created.length ? `${created.length} of ${ordered.length} teams added. ${parts.slice(1).join(' ')}` : parts.join(' '));
      }
    } finally { setBusy(false); }
  };
  return <div className='card admin-panel add-inline'>
    <div className='add-inline-head'><div><span className='label'>NEW TEAM</span><h2>Add a team</h2></div><button className='icon-btn' onClick={onClose} aria-label='Close'><X size={16} /></button></div>
    <div className='form-grid'>
      {clubBase ? <input value={clubBase} readOnly aria-label='Team name' /> : <input value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder='Team name, e.g. Liverpool Portland' aria-label='Team name' />}
    </div>
    <fieldset className='division-picker'>
      <legend>Divisions</legend>
      <div className='division-options'>
        <label className='division-option division-all'><input type='checkbox' checked={allSelected} onChange={() => setDivisions(allSelected ? [] : [...AGE_GROUPS])} /><span>Select all</span></label>
        {AGE_GROUPS.map(a => <label key={a} className='division-option'><input type='checkbox' checked={divisions.includes(a)} onChange={() => { toggle(a); setError(''); }} /><span>{a}</span></label>)}
      </div>
    </fieldset>
    {baseName && ordered.length > 0 && <p className='division-preview'>Will create: {ordered.map(nameFor).join(', ')}</p>}
    {error && <p className='form-error' role='alert'>{error}</p>}
    <button className='primary' disabled={busy} onClick={() => void save()}><Plus size={15} />{busy ? 'Adding…' : ordered.length > 1 ? `Add ${ordered.length} teams` : 'Add team'}</button>
  </div>;
}

/** Inline "Add player" form: adds the player straight to a team's squad. */
export function AddPlayerForm({ teams, club, defaultAge, onClose, onAdded, setNotice }: { teams: Team[]; club?: string; defaultAge: string; onClose: () => void; onAdded: () => Promise<void>; setNotice: (v: string) => void }) {
  // A club may only add players to its own teams; the admin (no club) sees every team.
  const clubBase = String(club || '').replace(/\s+FC$/i, '').trim().toLowerCase();
  const sorted = teams.filter(t => !clubBase || t.name.toLowerCase().startsWith(clubBase)).sort((a, b) => a.name.localeCompare(b.name));
  // Divisions offered are only those the club actually has teams in.
  const divisions = AGE_GROUPS.filter(a => sorted.some(t => t.ageGroup === a));
  const startDivision = divisions.includes(defaultAge) ? defaultAge : '';
  const [name, setName] = useState('');
  const [division, setDivision] = useState(startDivision);
  const [team, setTeam] = useState(() => { const first = sorted.filter(t => t.ageGroup === startDivision); return first.length === 1 ? first[0].name : ''; });
  const [position, setPosition] = useState('MF');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inDivision = sorted.filter(t => t.ageGroup === division);
  const chooseDivision = (value: string) => {
    setDivision(value); setError('');
    const options = sorted.filter(t => t.ageGroup === value);
    setTeam(options.length === 1 ? options[0].name : '');
  };
  const save = async () => {
    if (!division) { setError('Choose a division before adding the player.'); return; }
    if (!team || !inDivision.some(t => t.name === team)) { setError(`Choose a team in the ${division} division.`); return; }
    if (!name.trim()) { setError('Enter the player name.'); return; }
    setError('');
    setBusy(true);
    try {
      const memberRef = `MEM-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      await api.post('/api/players', { name: name.trim(), team, ageGroup: division, position, number: Number(number) || 0, status: 'Fit', rating: 6, memberRef });
      await onAdded();
      setNotice(`${name.trim()} added to ${team} (${division}).`);
      setName(''); setNumber('');
    } catch (err) { const message = errorText(err, 'Could not add the player.'); setError(message); setNotice(message); }
    finally { setBusy(false); }
  };
  if (!sorted.length) return <div className='card admin-panel add-inline'><div className='add-inline-head'><div><span className='label'>NEW PLAYER</span><h2>Add a player</h2></div><button className='icon-btn' onClick={onClose} aria-label='Close'><X size={16} /></button></div><p className='muted'>Add a team first, then players can be added to it.</p></div>;
  return <div className='card admin-panel add-inline'>
    <div className='add-inline-head'><div><span className='label'>NEW PLAYER</span><h2>Add a player</h2></div><button className='icon-btn' onClick={onClose} aria-label='Close'><X size={16} /></button></div>
    <div className='form-grid'>
      <input value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder='Player full name' aria-label='Player name' />
      <select value={division} onChange={e => chooseDivision(e.target.value)} aria-label='Division' aria-required='true' aria-invalid={!!error && !division}><option value=''>Select division</option>{divisions.map(d => <option key={d} value={d}>{d}</option>)}</select>
      <select value={team} onChange={e => { setTeam(e.target.value); setError(''); }} aria-label='Team' disabled={!division}><option value=''>{division ? 'Select team' : 'Choose a division first'}</option>{inDivision.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
      <select value={position} onChange={e => setPosition(e.target.value)} aria-label='Position'>{['GK', 'DF', 'MF', 'FW'].map(p => <option key={p}>{p}</option>)}</select>
      <input type='number' min='0' max='99' value={number} onChange={e => setNumber(e.target.value)} placeholder='Shirt no.' aria-label='Shirt number' />
    </div>
    {error && <p className='form-error' role='alert'>{error}</p>}
    <button className='primary' disabled={busy} onClick={() => void save()}><Plus size={15} />{busy ? 'Adding…' : 'Add player'}</button>
  </div>;
}
