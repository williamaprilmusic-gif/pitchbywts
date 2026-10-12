import { useEffect } from 'react';

const refreshTargets = [
  'home','fixtures','table','squad','club','teams','matchday','league','officials','discipline','portal','performance',
  'intelligence','operations','competition','registration','finance','communications','reports','public','club-management',
  'player-registry','scheduling','control-tower','matchday-command','automation','predictive','live-match','access-management',
  'league-identity','club-operating-system','player-family-system','safeguarding-compliance','compliance-governance',
  'decision-intelligence','executive-command','workflow-automation','competition-portfolio','cross-competition','competition-operations'
];

// Cross-tab operational sync: OperationalSync writes `pitchline.operational-sync` to
// localStorage on every important mutation. Other tabs receive a `storage` event and
// must re-fetch. We dispatch the same `pitchline:refresh-data` event the app already
// listens for (App.tsx syncData), rather than a bespoke event nothing subscribes to.
export default function ModuleConnectionBridge() {
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pitchline.operational-sync') {
        window.dispatchEvent(new CustomEvent('pitchline:refresh-data', { detail: { targets: refreshTargets, at: Date.now(), reason: 'cross-tab-sync' } }));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return null;
}
