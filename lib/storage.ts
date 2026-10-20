import { browser } from 'wxt/browser';
import { startOfDay } from './format';
import type { Card, ExportFile, GitHubConfig, Settings, Source, SyncStatus } from './types';

// One key per card so a save only rewrites that card, not the whole deck.
const CARD_PREFIX = 'card:';
const SETTINGS_KEY = 'settings';
const DELETED_KEY = 'deleted';
const GITHUB_KEY = 'github';
const SYNC_STATUS_KEY = 'syncStatus';

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

/** When the card last changed. Cards saved before `updatedAt` existed fall back to lastSeenAt. */
export function changedAt(card: Card): number {
  return card.updatedAt ?? card.lastSeenAt;
}

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

/** Stamps `updatedAt`, which is what sync and import compare, and returns the stored card. */
export async function saveCard(card: Card, now = Date.now()): Promise<Card> {
  const stamped = { ...card, updatedAt: now };
  await browser.storage.local.set({ [cardKey(card.id)]: stamped });
  return stamped;
}

/** Read-modify-write against the stored copy so concurrent edits elsewhere aren't lost. */
export async function updateCard(id: string, patch: (card: Card) => Card): Promise<Card | undefined> {
  const card = await getCard(id);
  if (!card) return undefined;
  return saveCard(patch(card));
}

/** Leaves a tombstone so sync deletes the card elsewhere instead of bringing it back. */
export async function deleteCard(id: string): Promise<void> {
  const deleted = await getDeleted();
  await browser.storage.local.set({ [DELETED_KEY]: { ...deleted, [id]: Date.now() } });
  await browser.storage.local.remove(cardKey(id));
}

export async function getDeleted(): Promise<Record<string, number>> {
  const got = await browser.storage.local.get(DELETED_KEY);
  return (got[DELETED_KEY] ?? {}) as Record<string, number>;
}

/**
 * Writes the result of a sync merge as-is, without stamping new timestamps,
 * so the next sync doesn't see these cards as local edits.
 */
export async function applyRemote(changes: {
  writes: Card[];
  removals: string[];
  deleted: Record<string, number>;
  settings?: Settings;
}): Promise<void> {
  // Only write what changed: every write fires storage.onChanged, which schedules another sync.
  const set: Record<string, unknown> = {};
  for (const card of changes.writes) set[cardKey(card.id)] = card;
  if (changes.settings) set[SETTINGS_KEY] = changes.settings;
  if (JSON.stringify(changes.deleted) !== JSON.stringify(await getDeleted())) set[DELETED_KEY] = changes.deleted;
  if (Object.keys(set).length) await browser.storage.local.set(set);
  if (changes.removals.length) await browser.storage.local.remove(changes.removals.map(cardKey));
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
  await browser.storage.local.set({ [SETTINGS_KEY]: { ...settings, updatedAt: Date.now() } });
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

/** True for writes that change the deck, which is what sync needs to push. */
export function isDeckChange(changes: Record<string, unknown>): boolean {
  return Object.keys(changes).some((k) => k.startsWith(CARD_PREFIX) || k === SETTINGS_KEY || k === DELETED_KEY);
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && SETTINGS_KEY in changes) getSettings().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function exportData(): Promise<ExportFile> {
  const [cards, settings, deleted] = await Promise.all([getAllCards(), getSettings(), getDeleted()]);
  return { app: 'memcode', version: 2, exportedAt: Date.now(), settings, cards, deleted };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/** Merges by card id; when both sides have a card, the one changed more recently wins. */
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
    else if (changedAt(card) > changedAt(current)) result.updated++;
    else {
      result.skipped++;
      continue;
    }
    writes[cardKey(card.id)] = card;
  }
  if (Object.keys(writes).length) await browser.storage.local.set(writes);
  return result;
}

export function isCardLike(value: unknown): value is Card {
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

export async function getGitHubConfig(): Promise<GitHubConfig | undefined> {
  const got = await browser.storage.local.get(GITHUB_KEY);
  return got[GITHUB_KEY] as GitHubConfig | undefined;
}

export async function saveGitHubConfig(config: GitHubConfig): Promise<void> {
  await browser.storage.local.set({ [GITHUB_KEY]: config });
}

/** Forgets the token and sync state. The local deck stays. */
export async function clearGitHubConfig(): Promise<void> {
  await browser.storage.local.remove([GITHUB_KEY, SYNC_STATUS_KEY]);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const got = await browser.storage.local.get(SYNC_STATUS_KEY);
  return (got[SYNC_STATUS_KEY] ?? {}) as SyncStatus;
}

export async function saveSyncStatus(status: SyncStatus): Promise<void> {
  await browser.storage.local.set({ [SYNC_STATUS_KEY]: status });
}

export function onSyncChanged(callback: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && (GITHUB_KEY in changes || SYNC_STATUS_KEY in changes)) callback();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
