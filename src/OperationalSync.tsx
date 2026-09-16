import { useEffect, useRef, useState } from 'react';
import { api } from './platformClient';

type SyncMessage = { path?: string; method?: string; at?: number; status?: 'ok'|'error' };

const STORAGE_KEY = 'pitchline.operational-sync';
const importantPrefixes = [
  '/api/fixtures', '/api/teams', '/api/players', '/api/registrations', '/api/payments',
  '/api/officials', '/api/discipline', '/api/team-sheets', '/api/performance', '/api/live-match',
  '/api/appointments', '/api/venues', '/api/invoices', '/api/communications', '/api/announcements',
  '/api/subscriptions', '/api/competition', '/api/clubs', '/api/user-roles', '/api/audit-log'
];

function shouldRefresh(path: string) {
  return importantPrefixes.some(prefix => path.startsWith(prefix));
}

export default function OperationalSync() {
  const [state, setState] = useState<'online'|'offline'|'syncing'>('online');
  const [lastMutation, setLastMutation] = useState<number>(() => {
    try { return Number(localStorage.getItem(STORAGE_KEY) || 0); } catch { return 0; }
  });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onMutation = (event: Event) => {
      const detail = (event as CustomEvent<SyncMessage>).detail || {};
      if (!detail.path || !shouldRefresh(detail.path)) return;
      const at = Number(detail.at || Date.now());
      setLastMutation(at);
      try { localStorage.setItem(STORAGE_KEY, String(at)); } catch { /* best effort */ }
      window.dispatchEvent(new CustomEvent('pitchline:refresh-data', { detail }));
    };
    const onOnline = () => {
      setState('syncing');
      window.dispatchEvent(new CustomEvent('pitchline:refresh-data', { detail: { reason: 'network-restored' } }));
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setState('online'), 900);
    };
    const onOffline = () => setState('offline');
    window.addEventListener('pitchline:api-mutation', onMutation as EventListener);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setState(navigator.onLine ? 'online' : 'offline');
    return () => {
      window.removeEventListener('pitchline:api-mutation', onMutation as EventListener);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return <div className={`ops-sync-indicator ${state}`} aria-live="polite" title={lastMutation ? `Last operational change ${new Date(lastMutation).toLocaleTimeString()}` : 'Operational sync ready'}>
    <span className="ops-sync-dot" />
    <span>{state === 'offline' ? 'Offline' : state === 'syncing' ? 'Syncing' : 'Live data'}</span>
  </div>;
}
