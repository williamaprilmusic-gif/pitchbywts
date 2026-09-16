import { useEffect } from 'react';

const refreshTargets = [
  'home','fixtures','table','squad','club','teams','matchday','league','officials','discipline','portal','performance',
  'intelligence','operations','competition','registration','finance','communications','reports','public','club-management',
  'player-registry','scheduling','control-tower','matchday-command','automation','predictive','live-match','access-management',
  'league-identity','club-operating-system','player-family-system','safeguarding-compliance','compliance-governance',
  'decision-intelligence','executive-command','workflow-automation','competition-portfolio','cross-competition','competition-operations'
];

const pathTargets: Array<[string,string[]]> = [
  ['/api/fixtures',['fixtures','table','home','operations','scheduling','control-tower','matchday-command','public','live-match','competition-operations']],
  ['/api/teams',['teams','table','squad','club-management','club-operating-system','home']],
  ['/api/players',['squad','player-registry','player-family-system','performance','matchday','home']],
  ['/api/registrations',['registration','player-registry','player-family-system','safeguarding-compliance','club-management','home']],
  ['/api/payments',['finance','registration','club-management','home']],
  ['/api/officials',['officials','operations','scheduling','matchday-command','control-tower']],
  ['/api/discipline',['discipline','performance','player-family-system','safeguarding-compliance','reports','home']],
  ['/api/team-sheets',['matchday','live-match','performance','squad','control-tower']],
  ['/api/live-match',['live-match','fixtures','table','performance','discipline','reports','public','home']],
  ['/api/performance',['performance','squad','intelligence','predictive','reports','home']],
  ['/api/appointments',['officials','operations','scheduling','matchday-command','control-tower']],
  ['/api/venues',['operations','scheduling','club-management','control-tower']],
  ['/api/invoices',['finance','reports','club-management','home']],
  ['/api/communications',['communications','portal','public','home']],
  ['/api/announcements',['communications','portal','public','home']],
  ['/api/competition',['competition','competition-portfolio','cross-competition','competition-operations','table','fixtures']],
  ['/api/clubs',['club','club-management','club-operating-system','registration','league','home']],
];

function destinations(path: string) {
  const exact = pathTargets.find(([prefix]) => path.startsWith(prefix));
  return exact?.[1] || refreshTargets;
}

export default function ModuleConnectionBridge() {
  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{path?:string}>).detail || {};
      const path = detail.path || '';
      const targets = destinations(path);
      window.dispatchEvent(new CustomEvent('pitchline:module-refresh', { detail: { path, targets, at: Date.now() } }));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pitchline.operational-sync') {
        window.dispatchEvent(new CustomEvent('pitchline:module-refresh', { detail: { targets: refreshTargets, at: Date.now(), reason: 'cross-tab-sync' } }));
      }
    };
    window.addEventListener('pitchline:refresh-data', onRefresh as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('pitchline:refresh-data', onRefresh as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return null;
}
