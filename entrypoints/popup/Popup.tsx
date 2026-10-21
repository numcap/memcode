import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { DifficultyPill } from '@/components/DifficultyPill';
import { SiteAccessBanner } from '@/components/SiteAccessBanner';
import { daysSinceLabel, dueLabel, sourceName } from '@/lib/format';
import { buildQueue, getAllCards, getSettings, isDue } from '@/lib/storage';
import type { Card } from '@/lib/types';

const RECENT_COUNT = 5;

function openDashboard(hash: string) {
  browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') + hash });
  window.close();
}

export function Popup() {
  const [state, setState] = useState<{ cards: Card[]; queue: Card[] } | null>(null);

  useEffect(() => {
    Promise.all([getAllCards(), getSettings()]).then(([cards, settings]) =>
      setState({ cards, queue: buildQueue(cards, settings) }),
    );
  }, []);

  if (!state) return <div className="popup" />;
  const { cards, queue } = state;
  const recent = [...cards].sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, RECENT_COUNT);
  const next = cards.filter((c) => !isDue(c)).sort((a, b) => a.srs.due - b.srs.due)[0];

  return (
    <div className="popup">
      <header className="popup-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            R
          </span>
          ReMCode
        </div>
        <button type="button" className="mc-btn mc-btn-ghost" onClick={() => openDashboard('#/settings')}>
          Settings
        </button>
      </header>

      <SiteAccessBanner />

      <section className="due-box">
        <div className="due-number">{queue.length}</div>
        <div className="due-label">{queue.length === 1 ? 'problem due' : 'problems due'}</div>
        <button
          type="button"
          className="mc-btn mc-btn-primary start"
          disabled={!queue.length}
          onClick={() => openDashboard('#/review')}
        >
          Start review
        </button>
        <div className="due-sub">
          {cards.length} in deck
          {!queue.length && next ? ` · next ${dueLabel(next.srs.due)}` : ''}
        </div>
      </section>

      {recent.length > 0 ? (
        <section>
          <h2>Recently seen</h2>
          <ul className="recent">
            {recent.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => openDashboard(`#/card/${encodeURIComponent(c.id)}`)}>
                  <span className="recent-title">
                    {c.title} <span className="recent-source">{sourceName(c.source)}</span>
                  </span>
                  <DifficultyPill difficulty={c.difficulty} />
                  <span className="recent-when">{daysSinceLabel(c.lastSeenAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="empty">
          Solve a problem on LeetCode or NeetCode. When it's accepted, you'll be asked how hard it was, and it gets added
          to your deck.
        </p>
      )}

      <footer>
        <button type="button" className="mc-btn" onClick={() => openDashboard('#/library')}>
          Open library
        </button>
      </footer>
    </div>
  );
}
