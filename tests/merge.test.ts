import { describe, expect, it } from 'vitest';
import { mergeDecks } from '@/lib/merge';
import { newSrsState } from '@/lib/srs';
import { DEFAULT_SETTINGS } from '@/lib/storage';
import type { Card, ExportFile } from '@/lib/types';

const DAY = 86_400_000;
const now = new Date('2026-10-02T15:00:00').getTime();

function makeCard(slug: string, updatedAt: number, overrides: Partial<Card> = {}): Card {
  return {
    source: 'leetcode',
    slug,
    id: `leetcode:${slug}`,
    title: slug,
    url: '',
    difficulty: 'Medium',
    tags: [],
    descriptionHtml: '',
    notes: '',
    submissions: [],
    srs: newSrsState(new Date(now)),
    reviewLog: [],
    createdAt: now - 10 * DAY,
    lastSeenAt: now - 10 * DAY,
    updatedAt,
    ...overrides,
  };
}

function deck(cards: Card[], extra: Partial<ExportFile> = {}): ExportFile {
  return { app: 'remcode', version: 2, exportedAt: now, settings: DEFAULT_SETTINGS, cards, deleted: {}, ...extra };
}

const ids = (cards: Card[]) => cards.map((c) => c.id);

describe('mergeDecks', () => {
  it('pushes everything when there is no remote yet', () => {
    const result = mergeDecks(deck([makeCard('a', now)]), null);
    expect(result.remoteChanged).toBe(true);
    expect(result.localWrites).toEqual([]);
    expect(ids(result.deck.cards)).toEqual(['leetcode:a']);
  });

  it('keeps the newer copy of each card, using updatedAt so notes-only edits count', () => {
    const local = deck([makeCard('a', now, { notes: 'edited here' }), makeCard('b', now - 2 * DAY)]);
    const remote = deck([makeCard('a', now - DAY), makeCard('b', now - DAY, { notes: 'edited there' }), makeCard('c', now)]);
    const result = mergeDecks(local, remote);
    expect(result.deck.cards.map((c) => c.notes)).toEqual(['edited here', 'edited there', '']);
    expect(ids(result.localWrites)).toEqual(['leetcode:b', 'leetcode:c']);
    expect(result.remoteChanged).toBe(true);
  });

  it('falls back to lastSeenAt for cards saved before updatedAt existed', () => {
    const old = makeCard('a', 0, { lastSeenAt: now - DAY, notes: 'old format' });
    delete old.updatedAt;
    const result = mergeDecks(deck([makeCard('a', now - 2 * DAY)]), deck([old]));
    expect(result.deck.cards[0]?.notes).toBe('old format');
  });

  it('applies tombstones to older copies on either side', () => {
    const local = deck([makeCard('a', now - 2 * DAY)]);
    const remote = deck([], { deleted: { 'leetcode:a': now - DAY } });
    const result = mergeDecks(local, remote);
    expect(result.deck.cards).toEqual([]);
    expect(result.localRemovals).toEqual(['leetcode:a']);
    expect(result.deck.deleted).toEqual({ 'leetcode:a': now - DAY });

    const back = mergeDecks(deck([], { deleted: { 'leetcode:a': now - DAY } }), deck([makeCard('a', now - 2 * DAY)]));
    expect(back.deck.cards).toEqual([]);
    expect(back.localWrites).toEqual([]);
    expect(back.remoteChanged).toBe(true);
  });

  it('lets a card re-added after its deletion win and drops the tombstone', () => {
    const local = deck([makeCard('a', now)]);
    const remote = deck([], { deleted: { 'leetcode:a': now - DAY } });
    const result = mergeDecks(local, remote);
    expect(ids(result.deck.cards)).toEqual(['leetcode:a']);
    expect(result.localRemovals).toEqual([]);
    expect(result.deck.deleted).toEqual({});
  });

  it('takes the newer settings', () => {
    const local = deck([], { settings: { ...DEFAULT_SETTINGS, retention: 0.85, updatedAt: now - DAY } });
    const remote = deck([], { settings: { ...DEFAULT_SETTINGS, retention: 0.95, updatedAt: now } });
    const result = mergeDecks(local, remote);
    expect(result.localSettings?.retention).toBe(0.95);
    expect(result.remoteChanged).toBe(false);
    expect(mergeDecks(remote, local).localSettings).toBeUndefined();
    expect(mergeDecks(remote, local).remoteChanged).toBe(true);
  });

  it('reports no change for identical decks, whatever exportedAt says', () => {
    const cards = [makeCard('a', now), makeCard('b', now - DAY)];
    const result = mergeDecks(deck(cards, { exportedAt: now }), deck([...cards].reverse(), { exportedAt: now - DAY }));
    expect(result.remoteChanged).toBe(false);
    expect(result.localWrites).toEqual([]);
    expect(result.localRemovals).toEqual([]);
  });
});
