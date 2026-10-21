import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookUpProblem, parseProblemRef, slugify } from '@/lib/lookup';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('parseProblemRef', () => {
  it('reads LeetCode numbers', () => {
    expect(parseProblemRef('42')).toEqual({ site: 'leetcode', number: '42' });
    expect(parseProblemRef(' #1. ')).toEqual({ site: 'leetcode', number: '1' });
    expect(parseProblemRef('007')).toEqual({ site: 'leetcode', number: '7' });
  });

  it('reads LeetCode and NeetCode links, with or without scheme and extra path', () => {
    expect(parseProblemRef('https://leetcode.com/problems/two-sum/description/')).toEqual({ site: 'leetcode', slug: 'two-sum' });
    expect(parseProblemRef('leetcode.com/problems/Trapping-Rain-Water')).toEqual({ site: 'leetcode', slug: 'trapping-rain-water' });
    expect(parseProblemRef('https://leetcode.cn/problems/two-sum/')).toEqual({ site: 'leetcode', slug: 'two-sum' });
    expect(parseProblemRef('https://neetcode.io/problems/two-integer-sum/question')).toEqual({ site: 'neetcode', slug: 'two-integer-sum' });
  });

  it('treats a bare slug as LeetCode and rejects anything else', () => {
    expect(parseProblemRef('two-sum')).toEqual({ site: 'leetcode', slug: 'two-sum' });
    expect(parseProblemRef('Two Sum')).toBeNull();
    expect(parseProblemRef('https://example.com/problems/x')).toBeNull();
    expect(parseProblemRef('')).toBeNull();
  });
});

describe('lookUpProblem', () => {
  it('finds a LeetCode problem by number, picking the exact match from the search', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const { query, variables } = JSON.parse(init.body as string);
      expect(url).toBe('https://leetcode.com/graphql');
      expect(init.credentials).toBe('omit');
      if (query.includes('questionList')) {
        expect(variables.filters.searchKeywords).toBe('1');
        return json({ data: { questionList: { data: [
          { questionFrontendId: '191', titleSlug: 'number-of-1-bits' },
          { questionFrontendId: '1', titleSlug: 'two-sum' },
        ] } } });
      }
      expect(variables.titleSlug).toBe('two-sum');
      return json({ data: { question: {
        questionFrontendId: '1', title: 'Two Sum', titleSlug: 'two-sum', content: '<p>Find two numbers.</p>',
        difficulty: 'Easy', topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
      } } });
    });
    vi.stubGlobal('fetch', fetch);
    expect(await lookUpProblem({ site: 'leetcode', number: '1' })).toEqual({
      source: 'leetcode', slug: 'two-sum', title: 'Two Sum', url: 'https://leetcode.com/problems/two-sum/',
      difficulty: 'Easy', tags: ['Array', 'Hash Table'], descriptionHtml: '<p>Find two numbers.</p>', frontendId: '1',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('says so when the number does not exist', async () => {
    vi.stubGlobal('fetch', async () => json({ data: { questionList: { data: [] } } }));
    await expect(lookUpProblem({ site: 'leetcode', number: '99999' })).rejects.toThrow('LeetCode has no problem #99999.');
  });

  it('fetches NeetCode problems from neetcode.io', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      expect(url).toBe('https://neetcode.io/api/getProblemMetadataFunctionHttp');
      return json({ data: { id: 'two-integer-sum', name: 'Two Sum', difficulty: 'Easy', description: 'Find **two**.' } });
    });
    const problem = await lookUpProblem({ site: 'neetcode', slug: 'two-integer-sum' });
    expect(problem).toMatchObject({ source: 'neetcode', slug: 'two-integer-sum', title: 'Two Sum', difficulty: 'Easy' });
    expect(problem.descriptionHtml).toContain('<strong>two</strong>');
  });

  it('reports HTTP failures', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    await expect(lookUpProblem({ site: 'leetcode', slug: 'two-sum' })).rejects.toThrow('Request to leetcode.com failed (429)');
  });
});

describe('slugify', () => {
  it('makes readable ids from titles', () => {
    expect(slugify('Two Sum (Variant)!')).toBe('two-sum-variant');
    expect(slugify('Café  Problème')).toBe('cafe-probleme');
    expect(slugify('!!!')).toBe('problem');
  });
});
