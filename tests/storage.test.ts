import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { newSrsState } from '@/lib/srs';
import {
  buildQueue,
  DEFAULT_SETTINGS,
  exportData,
  getAllCards,
  getCard,
  getSettings,
  importData,
  isDue,
  saveCard,
  saveSettings,
} from '@/lib/storage';
import type { Card } from '@/lib/types';

const DAY = 86_400_000;
const now = new Date('2026-10-02T15:00:00').getTime();

function makeCard(slug: string, due: number, overrides: Partial<Card> = {}): Card {
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
    srs: { ...newSrsState(new Date(now)), due },
    reviewLog: [],
    createdAt: now - 10 * DAY,
    lastSeenAt: now - 5 * DAY,
    ...overrides,
  };
}

describe('due logic', () => {
  it('counts anything scheduled before tomorrow as due', () => {
    const tonight = new Date('2026-10-02T23:30:00').getTime();
    const tomorrow = new Date('2026-10-03T00:30:00').getTime();
    expect(isDue(makeCard('a', tonight), now)).toBe(true);
    expect(isDue(makeCard('b', tomorrow), now)).toBe(false);
  });

  it('orders the queue most-overdue first and applies the daily cap', () => {
    const cards = [
      makeCard('c', now - 1 * DAY),
      makeCard('a', now - 3 * DAY),
      makeCard('future', now + 3 * DAY),
      makeCard('b', now - 2 * DAY),
    ];
    expect(buildQueue(cards, DEFAULT_SETTINGS, now).map((c) => c.slug)).toEqual(['a', 'b', 'c']);
    expect(buildQueue(cards, { ...DEFAULT_SETTINGS, maxReviewsPerDay: 2 }, now).map((c) => c.slug)).toEqual(['a', 'b']);
    expect(buildQueue(cards, { ...DEFAULT_SETTINGS, maxReviewsPerDay: 0 }, now)).toHaveLength(3);
  });

  it('subtracts reviews already done today from the cap (solves do not count)', () => {
    const cards = [
      makeCard('a', now - DAY),
      makeCard('b', now - DAY),
      makeCard('done', now + DAY, {
        reviewLog: [
          { at: now - 60_000, rating: 3, kind: 'review' },
          { at: now - 30_000, rating: 3, kind: 'solve' },
        ],
      }),
    ];
    expect(buildQueue(cards, { ...DEFAULT_SETTINGS, maxReviewsPerDay: 2 }, now).map((c) => c.slug)).toEqual(['a']);
  });
});

describe('settings', () => {
  beforeEach(() => fakeBrowser.reset());

  it('fills defaults, including nested ones', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    await fakeBrowser.storage.local.set({ settings: { retention: 0.85, autoPrompt: { leetcode: false } } });
    const s = await getSettings();
    expect(s.retention).toBe(0.85);
    expect(s.autoPrompt).toEqual({ leetcode: false, neetcode: true });
  });

  it('round-trips', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, maxReviewsPerDay: 7 });
    expect((await getSettings()).maxReviewsPerDay).toBe(7);
  });
});

describe('export / import', () => {
  beforeEach(() => fakeBrowser.reset());

  it('exports everything and merges imports by recency', async () => {
    await saveCard(makeCard('kept', now, { lastSeenAt: now, notes: 'local newer' }));
    await saveCard(makeCard('stale', now, { lastSeenAt: now - 9 * DAY, notes: 'local older' }));
    const exported = await exportData();
    expect(exported.app).toBe('memcode');
    expect(exported.cards).toHaveLength(2);

    const result = await importData({
      ...exported,
      cards: [
        makeCard('kept', now, { lastSeenAt: now - DAY, notes: 'import older' }),
        makeCard('stale', now, { lastSeenAt: now - DAY, notes: 'import newer' }),
        makeCard('brand-new', now),
        { junk: true },
      ],
    });
    expect(result).toEqual({ added: 1, updated: 1, skipped: 2 });
    expect((await getCard('leetcode:kept'))?.notes).toBe('local newer');
    expect((await getCard('leetcode:stale'))?.notes).toBe('import newer');
    expect(await getAllCards()).toHaveLength(3);
  });

  it('rejects files that are not MemCode exports', async () => {
    await expect(importData({ cards: [] })).rejects.toThrow(/Not a MemCode export/);
    await expect(importData(null)).rejects.toThrow();
  });
});
