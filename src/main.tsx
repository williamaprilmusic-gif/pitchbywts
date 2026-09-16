import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppRuntime from './AppRuntime';
import InteractionEnhancer from './InteractionEnhancer';
import LiveSystemStatus from './LiveSystemStatus';
import ProfessionalSuite from './ProfessionalSuite';
import OperationsWorkbench from './OperationsWorkbench';
import OperationalSync from './OperationalSync';
import ModuleConnectionBridge from './ModuleConnectionBridge';
import './index.css';
import './mobile-professional.css';

function RuntimeServices() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  useEffect(() => { document.documentElement.dataset.pitchlineOnline = String(online); }, [online]);
  return <>
    <AppRuntime />
    <LiveSystemStatus />
    <InteractionEnhancer />
    <ProfessionalSuite />
    <OperationsWorkbench />
    <OperationalSync />
    <ModuleConnectionBridge />
  </>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeServices />
  </StrictMode>
);
