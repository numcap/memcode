import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyReview, recordReview, upsertFromSolve } from '@/lib/capture';
import { getAllCards, getCard, updateCard } from '@/lib/storage';
import type { Problem } from '@/lib/types';

const problem: Problem = {
  source: 'leetcode',
  slug: 'two-sum',
  title: 'Two Sum',
  url: 'https://leetcode.com/problems/two-sum/',
  difficulty: 'Easy',
  tags: ['Array', 'Hash Table'],
  descriptionHtml: '<p>Find two numbers.</p>',
  frontendId: '1',
};

const t0 = new Date('2026-10-01T10:00:00Z').getTime();

describe('capture', () => {
  beforeEach(() => fakeBrowser.reset());

  it('creates a card on first solve', async () => {
    const card = await upsertFromSolve(
      { problem, submission: { code: 'return []', lang: 'python3', at: t0 }, rating: 3, notes: 'hash map' },
      t0,
    );
    expect(card.id).toBe('leetcode:two-sum');
    expect(card.notes).toBe('hash map');
    expect(card.submissions).toHaveLength(1);
    expect(card.reviewLog).toEqual([{ at: t0, rating: 3, kind: 'solve' }]);
    expect(card.createdAt).toBe(t0);
    expect(card.srs.due).toBeGreaterThan(t0);
    expect(await getCard(card.id)).toEqual(card);
  });

  it('treats a re-solve as a review and keeps history', async () => {
    const first = await upsertFromSolve(
      { problem, submission: { code: 'v1', lang: 'python3', at: t0 }, rating: 3, notes: 'hash map' },
      t0,
    );
    const t1 = first.srs.due;
    const second = await upsertFromSolve(
      {
        problem: { ...problem, descriptionHtml: '', tags: [] },
        submission: { code: 'v2', lang: 'java', at: t1 },
        rating: 4,
        notes: 'hash map, one pass',
      },
      t1,
    );
    expect(second.createdAt).toBe(t0);
    expect(second.submissions.map((s) => s.code)).toEqual(['v2', 'v1']);
    expect(second.reviewLog).toHaveLength(2);
    expect(second.srs.reps).toBe(2);
    expect(second.srs.due).toBeGreaterThan(t1);
    // Thin metadata on the re-capture doesn't wipe what we had.
    expect(second.descriptionHtml).toBe(problem.descriptionHtml);
    expect(second.tags).toEqual(problem.tags);
    expect(await getAllCards()).toHaveLength(1);
  });

  it('does not duplicate an identical submission or store empty code', async () => {
    await upsertFromSolve({ problem, submission: { code: 'same', lang: 'cpp', at: t0 }, rating: 3, notes: '' }, t0);
    await upsertFromSolve({ problem, submission: { code: 'same', lang: 'cpp', at: t0 + 1 }, rating: 3, notes: '' }, t0 + 1);
    const card = await upsertFromSolve({ problem, submission: { code: '  ', lang: 'cpp', at: t0 + 2 }, rating: 3, notes: '' }, t0 + 2);
    expect(card.submissions).toHaveLength(1);
    expect(card.submissions[0]?.at).toBe(t0 + 1);
  });

  it('records reviews against the stored card without clobbering notes edited meanwhile', async () => {
    const card = await upsertFromSolve({ problem, rating: 3, notes: 'old' }, t0);
    await updateCard(card.id, (c) => ({ ...c, notes: 'edited elsewhere' }));
    const reviewed = await recordReview(card.id, 2, card.srs.due);
    expect(reviewed?.notes).toBe('edited elsewhere');
    expect(reviewed?.reviewLog.at(-1)).toEqual({ at: card.srs.due, rating: 2, kind: 'review' });
    expect(reviewed?.lastSeenAt).toBe(card.srs.due);
  });

  it('stores trimmed recall text on review entries and omits it when blank', async () => {
    const card = await upsertFromSolve({ problem, rating: 3, notes: '' }, t0);
    const first = await recordReview(card.id, 3, t0 + 1, '  two pointers?\n');
    expect(first?.reviewLog.at(-1)).toEqual({ at: t0 + 1, rating: 3, kind: 'review', recall: 'two pointers?' });
    const second = await recordReview(card.id, 4, t0 + 2, '   ');
    expect(second?.reviewLog.at(-1)).toEqual({ at: t0 + 2, rating: 4, kind: 'review' });
  });

  it('applyReview is pure', async () => {
    const card = await upsertFromSolve({ problem, rating: 3, notes: '' }, t0);
    const snapshot = structuredClone(card);
    applyReview(card, 1, 0.9, card.srs.due);
    expect(card).toEqual(snapshot);
  });
});
