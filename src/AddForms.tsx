import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from './platformClient';

type Team = { id: string; name: string; ageGroup: string };
const AGE_GROUPS = ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'Senior'];
const errorText = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

/** Inline "Add team" form. LFA Admin adds any team; a Club adds teams under its own club. */
export function AddTeamForm({ role, club, defaultAge, onClose, onAdded, setNotice }: { role: string; club?: string; defaultAge: string; onClose: () => void; onAdded: () => Promise<void>; setNotice: (v: string) => void }) {
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState(defaultAge || 'U14');
  const [busy, setBusy] = useState(false);
  // A club adds teams under its own name: "<club> <age group>", matching how the league links teams to clubs.
  const clubBase = role === 'LFA Admin' ? '' : String(club || '').replace(/\s+FC$/i, '').trim();
  const teamName = clubBase ? `${clubBase} ${ageGroup}` : name.trim();
  const save = async () => {
    if (!teamName) { setNotice('Enter the team name, for example "Liverpool Portland U16".'); return; }
    setBusy(true);
    try {
      await api.post(role === 'LFA Admin' ? '/api/teams' : '/api/club-teams', { name: teamName, ageGroup });
      await onAdded();
      setNotice(`${teamName} added.`);
      setName('');
      onClose();
    } catch (error) { setNotice(errorText(error, 'Could not add the team.')); }
    finally { setBusy(false); }
  };
  return <div className='card admin-panel add-inline'>
    <div className='add-inline-head'><div><span className='label'>NEW TEAM</span><h2>Add a team</h2></div><button className='icon-btn' onClick={onClose} aria-label='Close'><X size={16} /></button></div>
    <div className='form-grid'>
      {clubBase ? <input value={teamName} readOnly aria-label='Team name' /> : <input value={name} onChange={e => setName(e.target.value)} placeholder='Team name (club + age group)' aria-label='Team name' />}
      <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} aria-label='Age group'>{AGE_GROUPS.map(a => <option key={a}>{a}</option>)}</select>
    </div>
    <button className='primary' disabled={busy} onClick={() => void save()}><Plus size={15} />{busy ? 'Adding…' : 'Add team'}</button>
  </div>;
}

/** Inline "Add player" form: adds the player straight to a team's squad. */
export function AddPlayerForm({ teams, club, defaultAge, onClose, onAdded, setNotice }: { teams: Team[]; club?: string; defaultAge: string; onClose: () => void; onAdded: () => Promise<void>; setNotice: (v: string) => void }) {
  // A club may only add players to its own teams; the admin (no club) sees every team.
  const clubBase = String(club || '').replace(/\s+FC$/i, '').trim().toLowerCase();
  const sorted = teams.filter(t => !clubBase || t.name.toLowerCase().startsWith(clubBase)).sort((a, b) => a.name.localeCompare(b.name));
  const [name, setName] = useState('');
  const [team, setTeam] = useState(sorted.find(t => t.ageGroup === defaultAge)?.name || sorted[0]?.name || '');
  const [position, setPosition] = useState('MF');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || !team) { setNotice('Enter the player name and choose a team.'); return; }
    setBusy(true);
    try {
      const memberRef = `MEM-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      await api.post('/api/players', { name: name.trim(), team, position, number: Number(number) || 0, status: 'Fit', rating: 6, memberRef });
      await onAdded();
      setNotice(`${name.trim()} added to ${team}.`);
      setName(''); setNumber('');
    } catch (error) { setNotice(errorText(error, 'Could not add the player.')); }
    finally { setBusy(false); }
  };
  if (!sorted.length) return <div className='card admin-panel add-inline'><div className='add-inline-head'><div><span className='label'>NEW PLAYER</span><h2>Add a player</h2></div><button className='icon-btn' onClick={onClose} aria-label='Close'><X size={16} /></button></div><p className='muted'>Add a team first, then players can be added to it.</p></div>;
  return <div className='card admin-panel add-inline'>
    <div className='add-inline-head'><div><span className='label'>NEW PLAYER</span><h2>Add a player</h2></div><button className='icon-btn' onClick={onClose} aria-label='Close'><X size={16} /></button></div>
    <div className='form-grid'>
      <input value={name} onChange={e => setName(e.target.value)} placeholder='Player full name' aria-label='Player name' />
      <select value={team} onChange={e => setTeam(e.target.value)} aria-label='Team'>{sorted.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
      <select value={position} onChange={e => setPosition(e.target.value)} aria-label='Position'>{['GK', 'DF', 'MF', 'FW'].map(p => <option key={p}>{p}</option>)}</select>
      <input type='number' min='0' max='99' value={number} onChange={e => setNumber(e.target.value)} placeholder='Shirt no.' aria-label='Shirt number' />
    </div>
    <button className='primary' disabled={busy} onClick={() => void save()}><Plus size={15} />{busy ? 'Adding…' : 'Add player'}</button>
  </div>;
}
