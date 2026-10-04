import { useMemo, useState } from 'react';
import { api } from './platformClient';

type TeamRow = { id: string; name: string; ageGroup: string };
type VenueRow = { id: string; name: string };
type GenFixture = { home: string; away: string; date: string; time: string; venue: string; stage?: string; matchday: number; duplicate: boolean };
type BracketRow = { id: string; round: number; roundName: string; home: string; away: string; bye?: boolean; real: boolean };
type Preview = { fixtures: GenFixture[]; byes: Array<{ stage: string; team: string }>; bracket?: BracketRow[]; warnings: string[]; limitations: string[]; duplicateCount: number; existingInDivision: number; matchdayCount: number };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** LFA Admin auto-populate flow: configure, preview, then confirm. Rendered inside Fixtures & Scheduling. */
export default function FixtureGenerator({ teams, venues, setNotice, onSaved }: { teams: TeamRow[]; venues: VenueRow[]; setNotice: (v: string) => void; onSaved: () => void }) {
  const ages = useMemo(() => Array.from(new Set(teams.map(t => t.ageGroup).filter(Boolean))).sort(), [teams]);
  const [format, setFormat] = useState('league');
  const [age, setAge] = useState('');
  const [picked, setPicked] = useState<string[] | null>(null);
  const [legs, setLegs] = useState('1');
  const [startDate, setStartDate] = useState('2026-10-10');
  const [weekday, setWeekday] = useState('6');
  const [timesText, setTimesText] = useState('15:00');
  const [venueNames, setVenueNames] = useState<string[]>([]);
  const [groupCount, setGroupCount] = useState('2');
  const [qualifiers, setQualifiers] = useState('2');
  const [compName, setCompName] = useState('');
  const [skipDupes, setSkipDupes] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const division = age || ages[0] || '';
  const pool = format === 'league' || age ? teams.filter(t => t.ageGroup === division) : teams;
  const selected = picked ? picked.filter(n => pool.some(t => t.name === n)) : pool.map(t => t.name);
  const chosenVenues = venueNames.length ? venueNames : venues[0] ? [venues[0].name] : [];
  const reset = () => { setPreview(null); setError(''); setSkipDupes(false); };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const body = () => ({
    format, legs: Number(legs), startDate, weekday: Number(weekday), venues: chosenVenues,
    times: timesText.split(/[\s,;]+/).filter(Boolean), teams: selected, ageGroup: format === 'league' || age ? division : '',
    competitionName: compName.trim(), groupCount: Number(groupCount), qualifiers: Number(qualifiers),
  });

  const runPreview = async () => {
    setBusy(true); setError(''); setPreview(null); setSkipDupes(false);
    try { const r = await api.post('/api/fixture-generator/preview', body()); setPreview(r.data as Preview); }
    catch (e) { setError(errText(e, 'Could not generate a preview.')); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const r = await api.post('/api/fixture-generator/commit', { ...body(), duplicateMode: skipDupes ? 'skip' : 'abort' });
      setNotice(`${r.data?.created || 0} fixtures saved. ${r.data?.skippedDuplicates || 0} duplicates skipped.`);
      setPreview(null); onSaved();
    } catch (e) { setError(errText(e, 'Could not save the fixtures.')); }
    finally { setBusy(false); }
  };

  const byDay = new Map<number, GenFixture[]>();
  preview?.fixtures.forEach(f => byDay.set(f.matchday, [...(byDay.get(f.matchday) || []), f]));
  const toSave = preview ? preview.fixtures.length - (skipDupes ? preview.duplicateCount : 0) : 0;
  const blocked = !!preview && preview.duplicateCount > 0 && !skipDupes;

  return <section className='card admin-panel fixture-gen' aria-label='Auto-populate fixtures'>
    <span className='label'>AUTO-POPULATE FIXTURES</span><h2>League and tournament fixture generator</h2>
    <p className='muted small'>Pick the competition format, preview every fixture, then confirm to save. Nothing is saved until you confirm.</p>
    <div className='fixture-gen-grid'>
      <label>Format<select value={format} onChange={e => { setFormat(e.target.value); setPicked(null); reset(); }}><option value='league'>League round-robin</option><option value='knockout'>Tournament: knockout</option><option value='groups-knockout'>Tournament: groups then knockout</option></select></label>
      <label>{format === 'league' ? 'Division' : 'Age group (optional filter)'}<select value={format === 'league' ? division : age} onChange={e => { setAge(e.target.value); setPicked(null); reset(); }}>{format !== 'league' && <option value=''>All teams</option>}{ages.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      {format !== 'knockout' && <label>Round-robin legs<select value={legs} onChange={e => { setLegs(e.target.value); reset(); }}><option value='1'>Single (each pair once)</option><option value='2'>Double (home and away)</option></select></label>}
      {format === 'groups-knockout' && <><label>Groups<select value={groupCount} onChange={e => { setGroupCount(e.target.value); reset(); }}>{[2, 4, 8].map(n => <option key={n} value={n}>{n} groups</option>)}</select></label><label>Qualifiers per group<select value={qualifiers} onChange={e => { setQualifiers(e.target.value); reset(); }}><option value='1'>Winner only</option><option value='2'>Top two</option></select></label></>}
      <label>First matchday on or after<input type='date' value={startDate} onChange={e => { setStartDate(e.target.value); reset(); }} /></label>
      <label>Matchday weekday<select value={weekday} onChange={e => { setWeekday(e.target.value); reset(); }}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
      <label>Kick-off times (comma separated)<input value={timesText} onChange={e => { setTimesText(e.target.value); reset(); }} placeholder='13:00, 15:00' /></label>
      {format !== 'league' && <label>Competition name (optional)<input value={compName} maxLength={80} onChange={e => { setCompName(e.target.value); reset(); }} /></label>}
    </div>
    <fieldset className='fixture-gen-picks'><legend>Venues ({chosenVenues.length} selected)</legend>{venues.map(v => <label key={v.id} className='fixture-gen-chip'><input type='checkbox' checked={chosenVenues.includes(v.name)} onChange={() => { setVenueNames(toggle(chosenVenues, v.name)); reset(); }} />{v.name}</label>)}{!venues.length && <small className='muted'>Add a venue under Venue availability first.</small>}</fieldset>
    <fieldset className='fixture-gen-picks'><legend>Teams ({selected.length} selected{format === 'knockout' ? ', listed order is seeding' : ''})</legend>{pool.map(t => <label key={t.id} className='fixture-gen-chip'><input type='checkbox' checked={selected.includes(t.name)} onChange={() => { setPicked(toggle(selected, t.name)); reset(); }} />{t.name}</label>)}{!pool.length && <small className='muted'>No teams in this selection.</small>}</fieldset>
    <button className='primary' disabled={busy || selected.length < 2 || !chosenVenues.length} onClick={runPreview}>{busy && !preview ? 'Generating...' : 'Preview fixtures'}</button>
    {error && <p className='form-error' role='alert'>{error}</p>}
    {preview && <div className='fixture-gen-preview'>
      <h3>Preview: {preview.fixtures.length} fixtures over {preview.matchdayCount} matchday{preview.matchdayCount === 1 ? '' : 's'}</h3>
      {preview.warnings.map(w => <p key={w} className='fixture-gen-warn' role='alert'>{w}</p>)}
      {preview.limitations.map(w => <p key={w} className='fixture-gen-note'>{w}</p>)}
      {preview.byes.length > 0 && <p className='muted small'>Byes: {preview.byes.map(b => `${b.team} (${b.stage})`).join(', ')}</p>}
      <div className='fixture-gen-list'>{[...byDay.entries()].map(([d, list]) => <div key={d} className='fixture-gen-day'><b>Matchday {d} - {list[0].date}</b>{list.map((f, k) => <div key={k} className={f.duplicate ? 'fixture-gen-row dup' : 'fixture-gen-row'}><span>{f.home} v {f.away}</span><small>{f.time} - {f.venue}{f.stage ? ` - ${f.stage}` : ''}{f.duplicate ? ' - already exists' : ''}</small></div>)}</div>)}</div>
      {preview.bracket && <div className='fixture-gen-list'><b>Knockout bracket (placeholders are not saved)</b>{preview.bracket.map(m => <div key={m.id + m.round} className='fixture-gen-row'><span>{m.roundName} {m.id}: {m.home} v {m.away}</span><small>{m.bye ? 'Bye' : m.real ? 'Saved as fixture' : 'Placeholder only'}</small></div>)}</div>}
      {preview.duplicateCount > 0 && <label className='fixture-gen-chip'><input type='checkbox' checked={skipDupes} onChange={e => setSkipDupes(e.target.checked)} />Skip the {preview.duplicateCount} duplicate fixture(s) and save the rest</label>}
      <div className='fixture-gen-actions'><button className='primary' disabled={busy || blocked || toSave < 1} onClick={confirm}>{busy ? 'Saving...' : `Confirm and save ${toSave} fixtures`}</button><button className='ghost' disabled={busy} onClick={reset}>Discard preview</button></div>
    </div>}
  </section>;
}
