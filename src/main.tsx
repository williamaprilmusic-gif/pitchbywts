import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import InteractionEnhancer from './InteractionEnhancer';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <InteractionEnhancer />
  </StrictMode>
);
