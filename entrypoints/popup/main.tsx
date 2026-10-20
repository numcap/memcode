import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/components/theme.css';
import '@/components/ui.css';
import './style.css';
import { Popup } from './Popup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
