import { useEffect, useRef, useState } from 'react';
import App from './App';

function activeNavigation() {
  const active = document.querySelector<HTMLButtonElement>('.nav-item.active');
  return active?.textContent?.trim() || '';
}

function restoreNavigation(label: string) {
  if (!label) return;
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = normalise(label);
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.nav-item')).find(node => normalise(node.textContent || '') === wanted || normalise(node.textContent || '').startsWith(wanted));
  button?.click();
}

export default function AppRuntime() {
  const [revision, setRevision] = useState(0);
  const activeRef = useRef('');
  const queuedRef = useRef<number | null>(null);

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail || {};
      if (detail.reason === 'app-runtime-refresh') return;
      activeRef.current = activeNavigation();
      if (queuedRef.current) window.clearTimeout(queuedRef.current);
      queuedRef.current = window.setTimeout(() => {
        setRevision(value => value + 1);
        queuedRef.current = null;
      }, 500);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new CustomEvent('pitchline:refresh-data', { detail: { reason: 'visibility-restored' } }));
      }
    };
    window.addEventListener('pitchline:module-refresh', refresh as EventListener);
    window.addEventListener('pitchline:auth-change', refresh as EventListener);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pitchline:module-refresh', refresh as EventListener);
      window.removeEventListener('pitchline:auth-change', refresh as EventListener);
      document.removeEventListener('visibilitychange', onVisibility);
      if (queuedRef.current) window.clearTimeout(queuedRef.current);
    };
  }, []);

  useEffect(() => {
    const restore = window.setTimeout(() => restoreNavigation(activeRef.current), 40);
    return () => window.clearTimeout(restore);
  }, [revision]);

  return <App key={revision} />;
}
