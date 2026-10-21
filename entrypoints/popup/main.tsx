import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initPageTheme } from '@/components/pageTheme';
import '@/components/theme.css';
import '@/components/ui.css';
import './style.css';
import { Popup } from './Popup';

initPageTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
