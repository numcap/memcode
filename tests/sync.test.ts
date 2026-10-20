import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fromBase64, toBase64 } from '@/lib/github';
import { newSrsState } from '@/lib/srs';
import {
  deleteCard,
  exportData,
  getAllCards,
  getCard,
  getSyncStatus,
  saveCard,
  saveGitHubConfig,
  updateCard,
} from '@/lib/storage';
import { syncNow } from '@/lib/sync';
import type { Card, ExportFile } from '@/lib/types';

const now = new Date('2026-10-02T15:00:00').getTime();

function makeCard(slug: string, overrides: Partial<Card> = {}): Card {
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
    createdAt: now,
    lastSeenAt: now,
    ...overrides,
  };
}

/** Just enough of the contents API: one file, sha checks, and a hook to simulate another writer. */
class FakeGitHub {
  text: string | null = null;
  sha = 0;
  commits = 0;
  beforePut?: () => void;

  deck(): ExportFile {
    return JSON.parse(this.text!);
  }

  push(deck: ExportFile) {
    this.text = JSON.stringify(deck);
    this.sha++;
    this.commits++;
  }

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (!url.includes('/contents/memcode.json')) return reply(404, {});
    if (init.method !== 'PUT') {
      return this.text === null
        ? reply(404, { message: 'Not Found' })
        : reply(200, { sha: String(this.sha), encoding: 'base64', content: toBase64(this.text) });
    }
    this.beforePut?.();
    this.beforePut = undefined;
    const body = JSON.parse(init.body as string) as { content: string; sha?: string };
    if (this.text !== null && body.sha !== String(this.sha)) return reply(body.sha ? 409 : 422, { message: 'conflict' });
    this.text = fromBase64(body.content);
    this.sha++;
    this.commits++;
    return reply(200, { content: { sha: String(this.sha) } });
  };
}

let github: FakeGitHub;

/** Moves the clock on, so edits in one test don't share a millisecond. */
const tick = (ms = 60_000) => vi.setSystemTime(Date.now() + ms);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  fakeBrowser.reset();
  github = new FakeGitHub();
  vi.stubGlobal('fetch', github.fetch);
  await saveGitHubConfig({ token: 't', owner: 'me', repo: 'deck', path: 'memcode.json' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('syncNow', () => {
  it('does nothing until GitHub is connected', async () => {
    fakeBrowser.reset();
    expect(await syncNow()).toEqual({ ok: false, notConfigured: true });
  });

  it('creates the file from the local deck, then makes no commit when nothing changed', async () => {
    await saveCard(makeCard('a'));
    expect(await syncNow()).toEqual({ ok: true, pulled: 0, pushed: true });
    expect(github.deck().cards.map((c) => c.id)).toEqual(['leetcode:a']);
    expect(await syncNow()).toEqual({ ok: true, pulled: 0, pushed: false });
    expect(github.commits).toBe(1);
    expect((await getSyncStatus()).lastSyncAt).toBeGreaterThan(0);
  });

  it('pulls the deck into an empty browser, settings included', async () => {
    github.push({
      app: 'memcode',
      version: 2,
      exportedAt: now,
      settings: { retention: 0.85, maxReviewsPerDay: 10, hideTagsOnFront: false, autoPrompt: { leetcode: true, neetcode: false }, updatedAt: now },
      cards: [makeCard('a', { notes: 'from elsewhere' }), makeCard('b')],
      deleted: {},
    });
    expect(await syncNow()).toEqual({ ok: true, pulled: 2, pushed: false });
    expect((await getCard('leetcode:a'))?.notes).toBe('from elsewhere');
    expect((await exportData()).settings.retention).toBe(0.85);
  });

  it('propagates edits and deletions both ways', async () => {
    await saveCard(makeCard('a'));
    await saveCard(makeCard('b'));
    await syncNow();

    // Another browser edits a and deletes b.
    tick();
    const other = github.deck();
    other.cards = [{ ...other.cards[0]!, notes: 'edited elsewhere', updatedAt: Date.now() }];
    other.deleted = { 'leetcode:b': Date.now() };
    github.push(other);

    tick();
    await syncNow();
    expect((await getCard('leetcode:a'))?.notes).toBe('edited elsewhere');
    expect(await getCard('leetcode:b')).toBeUndefined();

    // Deleting here reaches GitHub too.
    tick();
    await deleteCard('leetcode:a');
    await syncNow();
    expect(github.deck().cards).toEqual([]);
    expect(Object.keys(github.deck().deleted ?? {}).sort()).toEqual(['leetcode:a', 'leetcode:b']);
  });

  it('re-merges when another browser pushes in between', async () => {
    await saveCard(makeCard('a'));
    await syncNow();
    tick();
    await updateCard('leetcode:a', (c) => ({ ...c, notes: 'mine' }));
    github.beforePut = () => {
      const other = github.deck();
      other.cards.push(makeCard('theirs', { updatedAt: Date.now() }));
      github.push(other);
    };
    expect(await syncNow()).toEqual({ ok: true, pulled: 1, pushed: true });
    const remote = github.deck();
    expect(remote.cards.map((c) => c.id)).toEqual(['leetcode:a', 'leetcode:theirs']);
    expect(remote.cards[0]?.notes).toBe('mine');
    expect(await getAllCards()).toHaveLength(2);
  });

  it('refuses to overwrite a file that is not a MemCode deck', async () => {
    github.text = '{"hello":"world"}';
    await saveCard(makeCard('a'));
    const result = await syncNow();
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a MemCode deck/) });
    expect(github.text).toBe('{"hello":"world"}');
    expect((await getSyncStatus()).lastError).toMatch(/isn't a MemCode deck/);
  });
});
