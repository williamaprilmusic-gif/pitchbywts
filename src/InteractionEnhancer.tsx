import { useEffect, useMemo, useState } from 'react';
import { Command, Search, X } from 'lucide-react';

type NavTarget =
  | 'home' | 'fixtures' | 'table' | 'squad' | 'club' | 'teams' | 'matchday'
  | 'league' | 'officials' | 'discipline' | 'portal' | 'performance' | 'intelligence'
  | 'operations' | 'competition' | 'registration' | 'finance' | 'communications' | 'reports'
  | 'public' | 'club-management' | 'player-registry' | 'scheduling' | 'control-tower'
  | 'matchday-command' | 'automation' | 'predictive' | 'live-match' | 'access-management'
  | 'league-identity' | 'club-operating-system' | 'player-family-system'
  | 'safeguarding-compliance' | 'compliance-governance' | 'decision-intelligence'
  | 'executive-command' | 'workflow-automation' | 'competition-portfolio'
  | 'cross-competition' | 'competition-operations';

const targets: Array<{ label: string; target: NavTarget; aliases: string[] }> = [
  { label: 'Dashboard', target: 'home', aliases: ['home', 'overview'] },
  { label: 'Fixtures & Results', target: 'fixtures', aliases: ['fixtures', 'results', 'calendar'] },
  { label: 'League Table', target: 'table', aliases: ['table', 'standings', 'league table'] },
  { label: 'Squad & Players', target: 'squad', aliases: ['squad', 'players', 'player'] },
  { label: 'Club Management', target: 'club-management', aliases: ['club management', 'club admin'] },
  { label: 'Teams & Age Groups', target: 'teams', aliases: ['teams', 'age groups'] },
  { label: 'Matchday', target: 'matchday', aliases: ['team sheet', 'matchday centre'] },
  { label: 'League Office', target: 'league', aliases: ['league office', 'schedule fixture'] },
  { label: 'Officials', target: 'officials', aliases: ['officials', 'referee'] },
  { label: 'Discipline', target: 'discipline', aliases: ['discipline', 'cards', 'suspension'] },
  { label: 'My Portal', target: 'portal', aliases: ['portal', 'member'] },
  { label: 'Performance', target: 'performance', aliases: ['performance', 'ratings', 'stats'] },
  { label: 'Club Intelligence', target: 'intelligence', aliases: ['intelligence', 'club intelligence'] },
  { label: 'League Operations', target: 'operations', aliases: ['operations', 'venue', 'appointment'] },
  { label: 'Competition Engine', target: 'competition', aliases: ['competition engine', 'round robin'] },
  { label: 'Club Registration', target: 'registration', aliases: ['registration', 'applications'] },
  { label: 'Finance', target: 'finance', aliases: ['finance', 'payments', 'invoices'] },
  { label: 'Communications', target: 'communications', aliases: ['communications', 'announcements', 'messages'] },
  { label: 'Reports', target: 'reports', aliases: ['reports', 'reporting'] },
  { label: 'League Portal', target: 'public', aliases: ['public', 'supporters', 'league'] },
  { label: 'Scheduling', target: 'scheduling', aliases: ['scheduling', 'advanced scheduling'] },
  { label: 'Control Tower', target: 'control-tower', aliases: ['control tower', 'exceptions'] },
  { label: 'Matchday Command', target: 'matchday-command', aliases: ['matchday command'] },
  { label: 'Automation', target: 'automation', aliases: ['automation', 'workflows'] },
  { label: 'Smart Insights', target: 'predictive', aliases: ['smart insights', 'predictive'] },
  { label: 'Live Match', target: 'live-match', aliases: ['live match', 'live'] },
  { label: 'Access & Settings', target: 'access-management', aliases: ['settings', 'access'] },
];

const actionMap: Array<{ className: string; resolver: (text: string) => NavTarget | null }> = [
  { className: 'stat', resolver: (text) => /next match/i.test(text) ? 'fixtures' : /squad/i.test(text) ? 'squad' : /league position/i.test(text) ? 'table' : /performance/i.test(text) ? 'performance' : null },
  { className: 'mini-row', resolver: () => 'table' },
  { className: 'feed-item', resolver: () => 'fixtures' },
  { className: 'exception-row', resolver: () => 'control-tower' },
  { className: 'readiness-item', resolver: () => 'matchday-command' },
  { className: 'roadmap-items span', resolver: (text) => {
      if (/schedule|fixture programme/i.test(text)) return 'scheduling';
      if (/official/i.test(text)) return 'officials';
      if (/result/i.test(text)) return 'fixtures';
      if (/discipline/i.test(text)) return 'discipline';
      if (/standing/i.test(text)) return 'table';
      if (/communication|share/i.test(text)) return 'communications';
      return null;
    } },
];

function emitNavigate(target: NavTarget) {
  window.dispatchEvent(new CustomEvent<NavTarget>('pitchline:navigate', { detail: target }));
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export default function InteractionEnhancer() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = normalise(query);
    if (!q) return targets;
    return targets.filter(item => [item.label, ...item.aliases].some(v => normalise(v).includes(q)));
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };

    const decorate = () => {
      for (const { className } of actionMap) {
        const nodes = document.querySelectorAll<HTMLElement>(className === 'roadmap-items span' ? '.roadmap-items span' : `.${className}`);
        nodes.forEach(node => {
          node.dataset.pitchlineInteractive = 'true';
          node.setAttribute('tabindex', '0');
          node.setAttribute('role', 'button');
        });
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const element = target?.closest<HTMLElement>('[data-pitchline-interactive="true"]');
      if (!element) return;
      const text = element.textContent || '';
      for (const rule of actionMap) {
        const match = rule.className === 'roadmap-items span'
          ? element.matches('.roadmap-items span')
          : element.classList.contains(rule.className);
        if (!match) continue;
        const destination = rule.resolver(text);
        if (!destination) continue;
        emitNavigate(destination);
        element.classList.add('pitchline-clicked');
        window.setTimeout(() => element.classList.remove('pitchline-clicked'), 320);
        return;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const element = target?.closest<HTMLElement>('[data-pitchline-interactive="true"]');
      if (!element || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      element.click();
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keydown', onKey);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <>
      <button className="command-palette-trigger" onClick={() => setOpen(true)} aria-label="Open Pitchline command palette">
        <Command size={14} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div className="command-backdrop" onClick={() => setOpen(false)}>
          <div className="command-palette" role="dialog" aria-modal="true" aria-label="Pitchline command palette" onClick={e => e.stopPropagation()}>
            <div className="command-head">
              <div className="command-search"><Search size={16} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search Pitchline…" /></div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close command palette"><X size={17} /></button>
            </div>
            <div className="command-results">
              {filtered.map(item => (
                <button key={item.target} className="command-item" onClick={() => { emitNavigate(item.target); setOpen(false); setQuery(''); }}>
                  <span>{item.label}</span><kbd>Enter</kbd>
                </button>
              ))}
              {!filtered.length && <div className="command-empty">No Pitchline destination matches that search.</div>}
            </div>
            <div className="command-footer"><span>Navigate</span><span>⌘/Ctrl + K</span><span>Esc to close</span></div>
          </div>
        </div>
      )}
      <style>{`
        .command-palette-trigger{position:fixed;right:134px;top:17px;height:36px;display:flex;align-items:center;gap:7px;padding:0 10px;border:1px solid #dfe8e3;border-radius:9px;background:#fff;color:#617169;font-size:11px;font-weight:750;cursor:pointer;z-index:11;box-shadow:0 2px 8px rgba(16,34,26,.04)}
        .command-palette-trigger:hover{border-color:#c8d7ce;background:#f9fbfa}
        .command-palette-trigger kbd,.command-item kbd{font:inherit;font-size:9px;color:#98a69f;background:#f3f6f4;border:1px solid #e3e9e5;padding:3px 5px;border-radius:5px}
        .command-backdrop{position:fixed;inset:0;background:rgba(12,22,18,.38);z-index:60;display:grid;place-items:start center;padding-top:105px}
        .command-palette{width:min(620px,calc(100vw - 32px));background:#fff;border:1px solid #dce6e0;border-radius:15px;overflow:hidden;box-shadow:0 30px 80px rgba(16,34,26,.28)}
        .command-head{display:flex;align-items:center;gap:9px;padding:10px;border-bottom:1px solid #edf1ee}
        .command-search{display:flex;align-items:center;gap:8px;flex:1;padding:0 8px;color:#74837b}.command-search input{width:100%;border:0;outline:0;padding:8px 0;font:inherit;font-size:13px;color:#1b2923}
        .command-results{max-height:430px;overflow:auto;padding:6px}.command-item{width:100%;display:flex;justify-content:space-between;align-items:center;border:0;background:#fff;border-radius:9px;padding:11px 12px;text-align:left;color:#34443c;font-size:12px;font-weight:700;cursor:pointer}.command-item:hover,.command-item:focus{background:#f3f8ef;outline:0}.command-empty{padding:28px 14px;color:#84928c;font-size:12px;text-align:center}.command-footer{display:flex;gap:14px;padding:9px 12px;border-top:1px solid #edf1ee;color:#8b9992;font-size:9px}.pitchline-clicked{transform:translateY(-1px);box-shadow:0 0 0 2px rgba(157,188,88,.22)!important;transition:all .16s ease}.stat[data-pitchline-interactive="true"],.mini-row[data-pitchline-interactive="true"],.feed-item[data-pitchline-interactive="true"],.exception-row[data-pitchline-interactive="true"],.readiness-item[data-pitchline-interactive="true"],.roadmap-items span[data-pitchline-interactive="true"]{cursor:pointer}.stat[data-pitchline-interactive="true"]:hover,.mini-row[data-pitchline-interactive="true"]:hover,.feed-item[data-pitchline-interactive="true"]:hover{background:#f8fbf7}.roadmap-items span[data-pitchline-interactive="true"]{display:inline-flex;align-items:center;transition:.15s ease}.roadmap-items span[data-pitchline-interactive="true"]:hover{transform:translateY(-1px);border-color:#cfe0bb;background:#f6faef}
        @media (max-width:760px){.command-palette-trigger{right:86px;padding:0 9px}.command-palette-trigger span,.command-palette-trigger kbd{display:none}.command-backdrop{padding-top:80px}.command-palette{width:calc(100vw - 20px)}}
      `}</style>
    </>
  );
}
