import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from './platformClient';
import { Crest, useBranding } from './branding';

type Fixture = { id: string; home: string; away: string; date: string; time: string; venue: string; status: string; homeScore?: number; awayScore?: number };
type MatchEvent = { id?: string; type: string; minute?: number; team?: string; player?: string; relatedPlayer?: string; note?: string; createdAt?: number };
type MatchState = { status?: string; homeScore?: number; awayScore?: number; events?: MatchEvent[]; verified?: boolean; finalScore?: { home?: number; away?: number } };

const icons: Record<string, string> = {
  Goal: '⚽', 'Own goal': '⚽', Penalty: '⚽', 'Yellow card': '🟨', 'Red card': '🟥', Substitution: '🔁', Sub: '🔁',
  Injury: '✚', Corner: '⚑', Offside: '⚐', 'Kick-off': '▶', 'Half time': '⏸', 'Full time': '⏹', 'VAR / Review': '🖥',
};
const quiet = new Set(['Possession']);
const statRows: Array<[string, string[]]> = [
  ['Shots', ['Shot', 'Shot on target', 'Goal']],
  ['On target', ['Shot on target', 'Goal']],
  ['Corners', ['Corner']],
  ['Fouls', ['Foul']],
  ['Offsides', ['Offside']],
  ['Yellow cards', ['Yellow card']],
  ['Red cards', ['Red card']],
];

export default function MatchCentre({ fixture, onClose }: { fixture: Fixture; onClose: () => void }) {
  const { league } = useBranding();
  const [state, setState] = useState<MatchState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const report = await api.get(`/api/live-match/${fixture.id}/report`);
        if (!cancelled) setState(report.data as MatchState);
      } catch {
        try {
          const live = await api.get(`/api/live-match/${fixture.id}`);
          if (!cancelled) setState(live.data as MatchState);
        } catch { if (!cancelled) setState(null); }
      } finally { if (!cancelled) setLoaded(true); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10000);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('keydown', onKey); };
  }, [fixture.id]);

  const events = useMemo(() => (state?.events || []).filter(e => !quiet.has(e.type)).sort((a, b) => (a.minute || 0) - (b.minute || 0) || (a.createdAt || 0) - (b.createdAt || 0)), [state]);
  const homeScore = state?.finalScore?.home ?? state?.homeScore ?? fixture.homeScore;
  const awayScore = state?.finalScore?.away ?? state?.awayScore ?? fixture.awayScore;
  const status = state?.status || (fixture.status === 'completed' ? 'Full time' : fixture.status === 'upcoming' ? 'Upcoming' : fixture.status);
  const isLive = /live|half/i.test(String(status));
  const side = (team?: string) => team === fixture.home ? 'home' : team === fixture.away ? 'away' : 'neutral';
  const stats = statRows.map(([label, types]) => {
    const count = (team: string) => (state?.events || []).filter(e => e.team === team && types.includes(e.type)).length;
    return { label, home: count(fixture.home), away: count(fixture.away) };
  }).filter(row => row.home + row.away > 0);

  return <div className='match-centre-backdrop' onClick={onClose}>
    <section className='match-centre' role='dialog' aria-modal='true' aria-label={`${fixture.home} vs ${fixture.away}`} onClick={event => event.stopPropagation()}>
      <header className='mc-head'>
        <span>{league.name} · {new Date(fixture.date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} · {fixture.time}</span>
        <button className='icon-btn' onClick={onClose} aria-label='Close match centre'><X size={17} /></button>
      </header>
      <div className='mc-score'>
        <div className='mc-team'><Crest team={fixture.home} size={56} /><b>{fixture.home}</b></div>
        <div className='mc-result'>
          <strong>{homeScore ?? '–'} <i>:</i> {awayScore ?? '–'}</strong>
          <span className={isLive ? 'mc-status live' : 'mc-status'}>{isLive && <span className='live-dot' />}{status}{state?.verified ? ' · verified' : ''}</span>
        </div>
        <div className='mc-team'><Crest team={fixture.away} size={56} /><b>{fixture.away}</b></div>
      </div>
      <p className='mc-venue'>{fixture.venue}</p>

      {!loaded && <div className='empty-state'><p>Loading match centre…</p></div>}
      {loaded && !events.length && <div className='empty-state'><h3>{status === 'Upcoming' ? 'Match not started' : 'No match events yet'}</h3><p>{status === 'Upcoming' ? 'Goals, cards and substitutions will appear here live once the match kicks off.' : 'Events recorded on Live Match will appear here.'}</p></div>}

      {stats.length > 0 && <div className='mc-stats'>
        {stats.map(row => { const total = row.home + row.away || 1; return <div className='mc-stat' key={row.label}>
          <div className='mc-stat-values'><b>{row.home}</b><span>{row.label}</span><b>{row.away}</b></div>
          <div className='mc-bar'><i className='home' style={{ width: `${(row.home / total) * 100}%` }} /><i className='away' style={{ width: `${(row.away / total) * 100}%` }} /></div>
        </div>; })}
      </div>}

      {events.length > 0 && <ol className='mc-timeline'>
        {events.map((event, index) => <li key={event.id || index} className={`mc-event ${side(event.team)}`}>
          <span className='mc-minute'>{event.minute ? `${event.minute}'` : ''}</span>
          <span className='mc-icon' aria-hidden='true'>{icons[event.type] || '•'}</span>
          <span className='mc-detail'><b>{event.type}</b>{event.player && <small>{event.player}{event.relatedPlayer ? ` → ${event.relatedPlayer}` : ''}</small>}{!event.player && event.team && <small>{event.team}</small>}</span>
        </li>)}
      </ol>}
    </section>
  </div>;
}
