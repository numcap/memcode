import { browser } from 'wxt/browser';
import { startOfDay } from './format';
import type { Card, ExportFile, Settings, Source } from './types';

// One key per card so a save only rewrites that card, not the whole deck.
const CARD_PREFIX = 'card:';
const SETTINGS_KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  retention: 0.9,
  maxReviewsPerDay: 50,
  hideTagsOnFront: true,
  autoPrompt: { leetcode: true, neetcode: true },
};

export function cardId(source: Source, slug: string): string {
  return `${source}:${slug}`;
}

const cardKey = (id: string) => CARD_PREFIX + id;

export async function getCard(id: string): Promise<Card | undefined> {
  const key = cardKey(id);
  const got = await browser.storage.local.get(key);
  return got[key] as Card | undefined;
}

export async function getAllCards(): Promise<Card[]> {
  const all = await browser.storage.local.get(null);
  return Object.entries(all)
    .filter(([key]) => key.startsWith(CARD_PREFIX))
    .map(([, value]) => value as Card);
}

export async function saveCard(card: Card): Promise<void> {
  await browser.storage.local.set({ [cardKey(card.id)]: card });
}

/** Read-modify-write against the stored copy so concurrent edits elsewhere aren't lost. */
export async function updateCard(id: string, patch: (card: Card) => Card): Promise<Card | undefined> {
  const card = await getCard(id);
  if (!card) return undefined;
  const next = patch(card);
  await saveCard(next);
  return next;
}

export async function deleteCard(id: string): Promise<void> {
  await browser.storage.local.remove(cardKey(id));
}

export async function getSettings(): Promise<Settings> {
  const got = await browser.storage.local.get(SETTINGS_KEY);
  const stored = (got[SETTINGS_KEY] ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    autoPrompt: { ...DEFAULT_SETTINGS.autoPrompt, ...stored.autoPrompt },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** Cards count as due for the whole calendar day they are scheduled on, like Anki. */
export function isDue(card: Card, now = Date.now()): boolean {
  return card.srs.due < startOfDay(now) + 24 * 60 * 60 * 1000;
}

export function reviewsDoneToday(cards: Card[], now = Date.now()): number {
  const since = startOfDay(now);
  let n = 0;
  for (const card of cards) {
    for (const entry of card.reviewLog) if (entry.kind === 'review' && entry.at >= since) n++;
  }
  return n;
}

/** Due cards, most overdue first, trimmed to what's left of the daily cap. */
export function buildQueue(cards: Card[], settings: Settings, now = Date.now()): Card[] {
  const due = cards.filter((c) => isDue(c, now)).sort((a, b) => a.srs.due - b.srs.due);
  if (settings.maxReviewsPerDay <= 0) return due;
  const remaining = Math.max(0, settings.maxReviewsPerDay - reviewsDoneToday(cards, now));
  return due.slice(0, remaining);
}

export async function getReviewQueue(now = Date.now()): Promise<Card[]> {
  const [cards, settings] = await Promise.all([getAllCards(), getSettings()]);
  return buildQueue(cards, settings, now);
}

export function onCardsChanged(callback: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && Object.keys(changes).some((k) => k.startsWith(CARD_PREFIX))) callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && SETTINGS_KEY in changes) getSettings().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function exportData(): Promise<ExportFile> {
  const [cards, settings] = await Promise.all([getAllCards(), getSettings()]);
  return { app: 'memcode', version: 1, exportedAt: Date.now(), settings, cards };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/** Merges by card id; when both sides have a card, the one seen more recently wins. */
export async function importData(data: unknown): Promise<ImportResult> {
  const file = data as Partial<ExportFile>;
  if (file?.app !== 'memcode' || !Array.isArray(file.cards)) {
    throw new Error('Not a MemCode export file.');
  }
  const existing = new Map((await getAllCards()).map((c) => [c.id, c]));
  const writes: Record<string, Card> = {};
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  for (const card of file.cards) {
    if (!isCardLike(card)) {
      result.skipped++;
      continue;
    }
    const current = existing.get(card.id);
    if (!current) result.added++;
    else if (card.lastSeenAt > current.lastSeenAt) result.updated++;
    else {
      result.skipped++;
      continue;
    }
    writes[cardKey(card.id)] = card;
  }
  if (Object.keys(writes).length) await browser.storage.local.set(writes);
  return result;
}

function isCardLike(value: unknown): value is Card {
  const c = value as Card;
  return (
    typeof c?.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.lastSeenAt === 'number' &&
    typeof c.srs?.due === 'number' &&
    Array.isArray(c.submissions) &&
    Array.isArray(c.reviewLog)
  );
}
