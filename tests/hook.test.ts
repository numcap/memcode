import { describe, expect, it } from 'vitest';
import { isHookMessage, problemSlugFromPath, TrafficInspector } from '@/lib/hook';
import neetcodeMetadata from './fixtures/neetcode-metadata.json';

const LC_PAGE = 'https://leetcode.com/problems/two-sum/description/';
const NC_PAGE = 'https://neetcode.io/problems/two-integer-sum/question';

// Shapes of LeetCode's submit/check responses.
const lcSubmit = (inspector: TrafficInspector, id = 1234567) =>
  inspector.inspect({
    url: 'https://leetcode.com/problems/two-sum/submit/',
    method: 'POST',
    requestBody: JSON.stringify({ lang: 'python3', question_id: '1', typed_code: 'class Solution: ...' }),
    responseText: JSON.stringify({ submission_id: id }),
    pageUrl: LC_PAGE,
  });

const lcCheck = (inspector: TrafficInspector, body: object, id = '1234567') =>
  inspector.inspect({
    url: `/submissions/detail/${id}/check/`,
    method: 'GET',
    responseText: JSON.stringify(body),
    pageUrl: LC_PAGE,
  });

const ACCEPTED = {
  status_code: 10,
  lang: 'python3',
  run_success: true,
  status_runtime: '3 ms',
  status_memory: '17.9 MB',
  total_correct: 63,
  total_testcases: 63,
  status_msg: 'Accepted',
  state: 'SUCCESS',
};

describe('TrafficInspector: LeetCode', () => {
  it('only wants submit and check traffic', () => {
    const inspector = new TrafficInspector();
    expect(inspector.wants('/problems/two-sum/submit/', 'POST', LC_PAGE)).toBe(true);
    expect(inspector.wants('/submissions/detail/99/check/', 'GET', LC_PAGE)).toBe(true);
    expect(inspector.wants('/problems/two-sum/interpret_solution/', 'POST', LC_PAGE)).toBe(false);
    expect(inspector.wants('/submissions/detail/runcode_1727_abc/check/', 'GET', LC_PAGE)).toBe(false);
    expect(inspector.wants('/graphql/', 'POST', LC_PAGE)).toBe(false);
    expect(inspector.wants('https://example.com/problems/x/submit/', 'POST', LC_PAGE)).toBe(false);
  });

  it('reports an accepted submission with the submitted code', () => {
    const inspector = new TrafficInspector();
    expect(lcSubmit(inspector)).toBeNull();
    expect(lcCheck(inspector, { state: 'STARTED' })).toBeNull();
    expect(lcCheck(inspector, ACCEPTED)).toEqual({
      type: 'accepted',
      site: 'leetcode',
      slug: 'two-sum',
      code: 'class Solution: ...',
      lang: 'python3',
      runtime: '3 ms',
      memory: '17.9 MB',
      submissionId: '1234567',
    });
  });

  it('reports each submission once even though the check endpoint is polled', () => {
    const inspector = new TrafficInspector();
    lcSubmit(inspector);
    expect(lcCheck(inspector, ACCEPTED)).not.toBeNull();
    expect(lcCheck(inspector, ACCEPTED)).toBeNull();
  });

  it('ignores wrong answers', () => {
    const inspector = new TrafficInspector();
    lcSubmit(inspector);
    expect(lcCheck(inspector, { ...ACCEPTED, status_code: 11, status_msg: 'Wrong Answer' })).toBeNull();
  });

  it('falls back to the page slug when the submit request was missed', () => {
    const inspector = new TrafficInspector();
    const event = lcCheck(inspector, ACCEPTED, '42');
    expect(event).toMatchObject({ type: 'accepted', slug: 'two-sum', code: undefined, submissionId: '42' });
  });
});

describe('TrafficInspector: NeetCode', () => {
  const execute = (inspector: TrafficInspector, description: string) =>
    inspector.inspect({
      url: '/api/executeCodeFunctionHttp',
      method: 'POST',
      requestBody: JSON.stringify({ data: { problemId: 'two-integer-sum', rawCode: 'def f(): ...', lang: 'python' } }),
      responseText: JSON.stringify({ data: { status: { id: 3, description }, time: '0.045', memory: 13200 } }),
      pageUrl: NC_PAGE,
    });

  it('reports accepted submissions', () => {
    expect(execute(new TrafficInspector(), 'Accepted')).toEqual({
      type: 'accepted',
      site: 'neetcode',
      slug: 'two-integer-sum',
      code: 'def f(): ...',
      lang: 'python',
      runtime: '45 ms',
    });
  });

  it('ignores failures and run-code calls', () => {
    const inspector = new TrafficInspector();
    expect(execute(inspector, 'Wrong Answer')).toBeNull();
    expect(inspector.wants('/api/runCodeFunctionHttp', 'POST', NC_PAGE)).toBe(false);
  });

  it('turns problem metadata into a meta event, picking the latest accepted submission', () => {
    const withHistory = {
      data: {
        ...neetcodeMetadata.data,
        submissionHistory: [
          { statusDescription: 'Accepted', code: 'old', language: 'python', date: '2026-09-01T00:00:00Z' },
          { statusDescription: 'Wrong Answer', code: 'bad', language: 'python', date: '2026-09-20T00:00:00Z' },
          { statusDescription: 'Accepted', code: 'new', language: 'java', date: '2026-09-10T00:00:00Z' },
        ],
      },
    };
    const event = new TrafficInspector().inspect({
      url: 'https://neetcode.io/api/getProblemMetadataFunctionHttp',
      method: 'POST',
      requestBody: JSON.stringify({ data: { problemId: 'two-integer-sum' } }),
      responseText: JSON.stringify(withHistory),
      pageUrl: NC_PAGE,
    });
    expect(event?.type).toBe('neetcode-meta');
    if (event?.type !== 'neetcode-meta') return;
    expect(event.meta).toMatchObject({
      id: 'two-integer-sum',
      name: 'Two Sum',
      difficulty: 'Easy',
      topics: ['Array', 'Hash Table'],
      latestAccepted: { code: 'new', lang: 'java' },
    });
  });
});

describe('helpers', () => {
  it('parses problem slugs from both sites', () => {
    expect(problemSlugFromPath('/problems/two-sum/description/')).toBe('two-sum');
    expect(problemSlugFromPath('/problems/two-integer-sum/question')).toBe('two-integer-sum');
    expect(problemSlugFromPath('/problemset/')).toBeNull();
  });

  it('validates hook messages', () => {
    expect(isHookMessage({ source: 'memcode-hook', event: { type: 'accepted' } })).toBe(true);
    expect(isHookMessage({ source: 'other', event: { type: 'accepted' } })).toBe(false);
    expect(isHookMessage('memcode-hook')).toBe(false);
  });
});
