import { useCallback, useEffect, useState } from 'react';
import { getAllCards, getSettings, onCardsChanged, onSettingsChanged } from '@/lib/storage';
import type { Card, Settings } from '@/lib/types';

export interface Route {
  name: 'review' | 'library' | 'card' | 'settings';
  param?: string;
  query: URLSearchParams;
}

function parseHash(hash: string): Route {
  const [path = '', search = ''] = hash.replace(/^#\/?/, '').split('?');
  const [name, param] = path.split('/');
  const query = new URLSearchParams(search);
  switch (name) {
    case 'library':
    case 'settings':
      return { name, query };
    case 'card':
      return param ? { name, param: decodeURIComponent(param), query } : { name: 'library', query };
    default:
      return { name: 'review', query };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const cardHref = (id: string) => `#/card/${encodeURIComponent(id)}`;

/** All cards, kept fresh as content scripts and other tabs write to storage. */
export function useCards(): { cards: Card[] | null; reload: () => void } {
  const [cards, setCards] = useState<Card[] | null>(null);
  const reload = useCallback(() => {
    getAllCards().then(setCards);
  }, []);
  useEffect(() => {
    reload();
    return onCardsChanged(reload);
  }, [reload]);
  return { cards, reload };
}

export function useSettings(): [Settings | null, (s: Settings) => void] {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    getSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);
  return [settings, setSettings];
}

/** Re-render periodically so "due"/"days ago" labels stay correct on a long-open tab. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
