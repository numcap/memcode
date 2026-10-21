import { useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import { daysSinceLabel } from '@/lib/format';
import { checkRepo } from '@/lib/github';
import { clearGitHubConfig, saveGitHubConfig } from '@/lib/storage';
import type { SyncResult } from '@/lib/sync';
import type { GitHubConfig } from '@/lib/types';
import { useNow, useSync } from './hooks';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
const DECK_PATH = 'remcode.json';

/** Accepts "owner/repo" or a github.com URL. */
function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .match(/^([\w.-]+)\/([\w.-]+)$/);
  return m?.[1] && m[2] ? { owner: m[1], repo: m[2] } : null;
}

const requestSync = () => browser.runtime.sendMessage({ type: 'sync-now' }) as Promise<SyncResult>;

function timeLabel(ts: number, now: number): string {
  const mins = Math.floor((now - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return daysSinceLabel(ts, now) === 'today' ? `${Math.floor(mins / 60)} h ago` : daysSinceLabel(ts, now);
}

export function SyncPanel() {
  const sync = useSync();
  const now = useNow(30_000);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sync) return null;
  const { config, status } = sync;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onConnect = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const parsed = parseRepo(repo);
      if (!parsed) throw new Error('Enter the repository as owner/name, e.g. octocat/remcode-deck.');
      if (!token.trim()) throw new Error('Paste a GitHub token.');
      const next: GitHubConfig = { ...parsed, token: token.trim(), branch: branch.trim() || undefined, path: DECK_PATH };
      await checkRepo(next);
      await saveGitHubConfig(next);
      setToken('');
      await requestSync();
    });
  };

  if (!config) {
    return (
      <section className="panel">
        <h2>GitHub sync</h2>
        <p className="setting-help">
          Keep your deck in a GitHub repository so every browser you connect shares it. Each change is a commit to{' '}
          <code>{DECK_PATH}</code>, which is the same format as Export JSON.
        </p>
        <ol className="setting-help sync-steps">
          <li>Create a new private repository (an empty one is fine).</li>
          <li>
            Create a{' '}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              fine-grained token
            </a>{' '}
            with access to <strong>only that repository</strong> and the <strong>Contents: Read and write</strong>{' '}
            permission.
          </li>
          <li>Enter both here. Do the same in your other browsers with the same repository.</li>
        </ol>
        <form className="sync-form" onSubmit={onConnect}>
          <input
            className="input"
            placeholder="owner/repository"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="input"
            placeholder="Branch (default branch if empty)"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="input"
            type="password"
            placeholder="github_pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="mc-btn mc-btn-primary" disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>
        <p className="setting-help">
          The token is stored unencrypted in this browser's extension storage and is never exported or synced.
        </p>
        {error && <p className="error">{error}</p>}
      </section>
    );
  }

  const failedLast = status.lastError && (status.errorAt ?? 0) >= (status.lastSyncAt ?? 0);
  return (
    <section className="panel">
      <h2>GitHub sync</h2>
      <p className="setting-help">
        Syncing with{' '}
        <a href={`https://github.com/${config.owner}/${config.repo}`} target="_blank" rel="noreferrer">
          {config.owner}/{config.repo}
        </a>
        {config.branch && ` (${config.branch})`}. Changes are pushed about 30 seconds after you make them, and other
        browsers' changes are pulled on startup, when the dashboard opens, and every 30 minutes. If the same problem
        changed in two browsers between syncs, the later change wins.
      </p>
      <p className="setting-help">
        {status.lastSyncAt ? `Last synced ${timeLabel(status.lastSyncAt, now)}.` : 'Not synced yet.'}
      </p>
      {failedLast && <p className="error">Last sync failed: {status.lastError}</p>}
      <div className="data-actions">
        <button
          type="button"
          className="mc-btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const result = await requestSync();
              if (!result.ok && 'error' in result) throw new Error(result.error);
            })
          }
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" className="mc-btn mc-btn-ghost" disabled={busy} onClick={() => run(clearGitHubConfig)}>
          Disconnect
        </button>
      </div>
      {error && !failedLast && <p className="error">{error}</p>}
    </section>
  );
}
