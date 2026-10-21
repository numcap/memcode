import { getFile, putFile, SyncConflictError } from './github';
import { mergeDecks } from './merge';
import {
  applyRemote,
  DEFAULT_SETTINGS,
  exportData,
  getGitHubConfig,
  getSyncStatus,
  isCardLike,
  isDeckFile,
  saveSyncStatus,
} from './storage';
import type { ExportFile, GitHubConfig } from './types';

const MAX_ATTEMPTS = 3;

export type SyncResult =
  | { ok: true; pulled: number; pushed: boolean }
  | { ok: false; error: string }
  | { ok: false; notConfigured: true };

let running: Promise<unknown> = Promise.resolve();

/** Pulls, merges and pushes. Calls queue up behind each other so two syncs never interleave. */
export function syncNow(): Promise<SyncResult> {
  const run = running.then(syncOnce);
  running = run.catch(() => {});
  return run;
}

async function syncOnce(): Promise<SyncResult> {
  const config = await getGitHubConfig();
  if (!config) return { ok: false, notConfigured: true };
  const status = await getSyncStatus();
  try {
    const result = await pullAndPush(config);
    await saveSyncStatus({ lastSyncAt: Date.now() });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await saveSyncStatus({ lastSyncAt: status.lastSyncAt, lastError: error, errorAt: Date.now() });
    return { ok: false, error };
  }
}

async function pullAndPush(config: GitHubConfig): Promise<SyncResult> {
  for (let attempt = 1; ; attempt++) {
    const remoteFile = await getFile(config);
    const remote = remoteFile ? parseDeck(remoteFile.text) : null;
    const merged = mergeDecks(await exportData(), remote);
    await applyRemote({
      writes: merged.localWrites,
      removals: merged.localRemovals,
      deleted: merged.deck.deleted ?? {},
      settings: merged.localSettings,
    });
    if (!merged.remoteChanged) return { ok: true, pulled: merged.localWrites.length, pushed: false };
    try {
      const n = merged.deck.cards.length;
      await putFile(config, JSON.stringify(merged.deck, null, 2) + '\n', remoteFile?.sha, `Sync ${n} card${n === 1 ? '' : 's'}`);
      return { ok: true, pulled: merged.localWrites.length, pushed: true };
    } catch (err) {
      // Another browser pushed in between. Merge again on top of its version.
      if (err instanceof SyncConflictError && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

/** Refuses anything that isn't a ReMCode deck rather than overwriting it. */
function parseDeck(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file on GitHub isn't valid JSON, so it was left alone. Fix or delete it, then sync again.");
  }
  if (!isDeckFile(data)) throw new Error("The file on GitHub isn't a ReMCode deck, so it was left alone.");
  const settings = { ...DEFAULT_SETTINGS, ...data.settings };
  settings.autoPrompt = { ...DEFAULT_SETTINGS.autoPrompt, ...data.settings?.autoPrompt };
  return {
    app: 'remcode',
    version: data.version ?? 1,
    exportedAt: data.exportedAt ?? 0,
    settings,
    cards: data.cards.filter(isCardLike),
    deleted: data.deleted ?? {},
  };
}
