import { useEffect } from 'react';
import App from './App';

export default function AppRuntime() {
  useEffect(() => {
    // Keep the React tree mounted during refresh/auth/visibility events.
    // Data refreshes must update existing state rather than destroy and recreate
    // the entire application, which caused visible flicker and temporary loss
    // of loaded information.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        window.dispatchEvent(new CustomEvent('pitchline:refresh-data', {
          detail: { reason: 'visibility-restored' }
        }));
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return <App />;
}
