import { useEffect } from 'react';
import { SiteAccessBanner } from '@/components/SiteAccessBanner';
import { buildQueue } from '@/lib/storage';
import { CardDetail } from './CardDetail';
import { useCards, useNow, useRoute, useSettings } from './hooks';
import { Library } from './Library';
import { Review } from './Review';
import { SettingsPage } from './SettingsPage';

export function App() {
  const route = useRoute();
  const { cards } = useCards();
  const [settings] = useSettings();
  const now = useNow();
  const dueCount = cards && settings ? buildQueue(cards, settings, now).length : 0;

  useEffect(() => {
    document.title = dueCount ? `(${dueCount}) MemCode` : 'MemCode';
  }, [dueCount]);

  const reviewCard = route.name === 'review' ? route.query.get('card') : null;

  return (
    <div className="app">
      <nav className="topnav">
        <a href="#/review" className="brand">
          <span className="brand-mark" aria-hidden>
            M
          </span>
          <span className="brand-text">MemCode</span>
        </a>
        <div className="nav-links">
          <a href="#/review" aria-current={route.name === 'review' ? 'page' : undefined}>
            Review{dueCount > 0 && <span className="nav-badge">{dueCount}</span>}
          </a>
          <a href="#/library" aria-current={route.name === 'library' || route.name === 'card' ? 'page' : undefined}>
            Library
          </a>
          <a href="#/settings" aria-current={route.name === 'settings' ? 'page' : undefined}>
            Settings
          </a>
        </div>
      </nav>
      <main className="content">
        <SiteAccessBanner />
        {route.name === 'review' && <Review key={reviewCard ?? 'due'} cardParam={reviewCard} />}
        {route.name === 'library' && <Library />}
        {route.name === 'card' && route.param && <CardDetail id={route.param} />}
        {route.name === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
