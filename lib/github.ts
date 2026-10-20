import type { GitHubConfig } from './types';

const API = 'https://api.github.com';

/** The file changed on GitHub between our read and our write. */
export class SyncConflictError extends Error {}

export interface RemoteFile {
  text: string;
  sha: string;
}

async function request(config: GitHubConfig, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(API + path, {
    ...init,
    // GitHub marks API responses cacheable for 60s; a stale read would look like a conflict.
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

async function failure(res: Response, what: string): Promise<Error> {
  let detail = '';
  try {
    detail = ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    // Not JSON; the status is enough.
  }
  if (res.status === 401) return new Error('GitHub rejected the token. It may have expired or been revoked.');
  return new Error(`${what} failed (${res.status}${detail ? `: ${detail}` : ''}).`);
}

const repoPath = (c: GitHubConfig) => `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`;
const filePath = (c: GitHubConfig) => c.path.split('/').filter(Boolean).map(encodeURIComponent).join('/');

/** Checks the repo (and branch, if set) exist and the token can see them. */
export async function checkRepo(config: GitHubConfig): Promise<void> {
  const res = await request(config, repoPath(config));
  if (res.status === 404) {
    throw new Error(`Can't find ${config.owner}/${config.repo}. Check the name and that the token has access to it.`);
  }
  if (!res.ok) throw await failure(res, 'Checking the repository');
  const repo = (await res.json()) as { permissions?: { push?: boolean } };
  if (repo.permissions && !repo.permissions.push) {
    throw new Error(`You don't have write access to ${config.owner}/${config.repo}.`);
  }
  if (config.branch) {
    const branch = await request(config, `${repoPath(config)}/branches/${encodeURIComponent(config.branch)}`);
    if (branch.status === 404) throw new Error(`Branch "${config.branch}" doesn't exist.`);
    if (!branch.ok) throw await failure(branch, 'Checking the branch');
  }
}

/** The deck file, or null if it doesn't exist yet (including in an empty repo). */
export async function getFile(config: GitHubConfig): Promise<RemoteFile | null> {
  const ref = config.branch ? `?ref=${encodeURIComponent(config.branch)}` : '';
  const res = await request(config, `${repoPath(config)}/contents/${filePath(config)}${ref}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await failure(res, 'Reading from GitHub');
  const file = (await res.json()) as { sha: string; content?: string; encoding?: string };
  if (file.content && file.encoding === 'base64') return { sha: file.sha, text: fromBase64(file.content) };

  // The contents API leaves `content` empty for files over 1 MB; the blob API goes up to 100 MB.
  const blob = await request(config, `${repoPath(config)}/git/blobs/${file.sha}`);
  if (!blob.ok) throw await failure(blob, 'Reading from GitHub');
  const data = (await blob.json()) as { content: string };
  return { sha: file.sha, text: fromBase64(data.content) };
}

/** Creates or replaces the deck file. `sha` must be the one just read, or undefined to create it. */
export async function putFile(
  config: GitHubConfig,
  text: string,
  sha: string | undefined,
  message: string,
): Promise<string> {
  const res = await request(config, `${repoPath(config)}/contents/${filePath(config)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(text),
      ...(sha && { sha }),
      ...(config.branch && { branch: config.branch }),
    }),
  });
  // 409: sha no longer current. 422: file appeared after we saw none ("sha wasn't supplied").
  if (res.status === 409 || (res.status === 422 && !sha)) {
    throw new SyncConflictError((await failure(res, 'Writing to GitHub')).message);
  }
  if (!res.ok) throw await failure(res, 'Writing to GitHub');
  return ((await res.json()) as { content: { sha: string } }).content.sha;
}

/** UTF-8 safe, unlike plain btoa: notes and code can contain any character. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
