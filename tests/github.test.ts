import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRepo, fromBase64, getFile, putFile, SyncConflictError, toBase64 } from '@/lib/github';
import type { GitHubConfig } from '@/lib/types';

const config: GitHubConfig = { token: 't', owner: 'me', repo: 'deck', path: 'remcode.json' };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('github client', () => {
  it('round-trips non-ASCII text through base64', () => {
    const text = 'naïve — 两数之和 🚀\n';
    expect(fromBase64(toBase64(text))).toBe(text);
    // GitHub wraps base64 at 60 columns.
    expect(fromBase64(toBase64(text).replace(/(.{8})/g, '$1\n'))).toBe(text);
  });

  it('returns null for a missing file and sends the token', async () => {
    const fetch = stubFetch(() => json(404, { message: 'Not Found' }));
    expect(await getFile({ ...config, branch: 'sync' })).toBeNull();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/me/deck/contents/remcode.json?ref=sync');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
    expect(init.cache).toBe('no-store');
  });

  it('decodes the file, falling back to the blob API for large files', async () => {
    stubFetch(() => json(200, { sha: 'abc', encoding: 'base64', content: toBase64('{"ok":1}') }));
    expect(await getFile(config)).toEqual({ sha: 'abc', text: '{"ok":1}' });

    const fetch = stubFetch((url) =>
      url.includes('/git/blobs/') ? json(200, { content: toBase64('big') }) : json(200, { sha: 'abc', encoding: 'none', content: '' }),
    );
    expect(await getFile(config)).toEqual({ sha: 'abc', text: 'big' });
    expect(fetch.mock.calls[1]![0]).toBe('https://api.github.com/repos/me/deck/git/blobs/abc');
  });

  it('writes with the previous sha and reports conflicts', async () => {
    const fetch = stubFetch(() => json(200, { content: { sha: 'new' } }));
    expect(await putFile({ ...config, branch: 'sync' }, 'hi', 'old', 'msg')).toBe('new');
    const body = JSON.parse(fetch.mock.calls[0]![1].body as string);
    expect(body).toEqual({ message: 'msg', content: toBase64('hi'), sha: 'old', branch: 'sync' });

    stubFetch(() => json(409, { message: 'does not match' }));
    await expect(putFile(config, 'hi', 'old', 'msg')).rejects.toBeInstanceOf(SyncConflictError);
    stubFetch(() => json(422, { message: '"sha" wasn\'t supplied.' }));
    await expect(putFile(config, 'hi', undefined, 'msg')).rejects.toBeInstanceOf(SyncConflictError);
    stubFetch(() => json(403, { message: 'Resource not accessible by personal access token' }));
    await expect(putFile(config, 'hi', 'old', 'msg')).rejects.toThrow(/403: Resource not accessible/);
  });

  it('explains bad tokens, missing repos and missing branches', async () => {
    stubFetch(() => json(401, { message: 'Bad credentials' }));
    await expect(checkRepo(config)).rejects.toThrow(/rejected the token/);
    stubFetch(() => json(404, { message: 'Not Found' }));
    await expect(checkRepo(config)).rejects.toThrow(/Can't find me\/deck/);
    stubFetch(() => json(200, { permissions: { push: false } }));
    await expect(checkRepo(config)).rejects.toThrow(/write access/);
    stubFetch((url) => (url.includes('/branches/') ? json(404, {}) : json(200, { permissions: { push: true } })));
    await expect(checkRepo({ ...config, branch: 'nope' })).rejects.toThrow(/Branch "nope"/);
    await expect(checkRepo(config)).resolves.toBeUndefined();
  });
});
