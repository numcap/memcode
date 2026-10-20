import { changedAt } from './storage';
import type { Card, ExportFile, Settings } from './types';

export interface MergeResult {
  /** What both sides should end up with. */
  deck: ExportFile;
  /** Cards to write locally because the remote copy is newer or new. */
  localWrites: Card[];
  /** Local card ids to remove because a newer tombstone says so. */
  localRemovals: string[];
  /** Set when the remote settings are newer than the local ones. */
  localSettings?: Settings;
  /** Whether the remote file needs a new commit. */
  remoteChanged: boolean;
}

/**
 * Merges two decks card by card: the copy changed more recently wins, and a
 * tombstone wins over any copy that is not newer than it (so solving a deleted
 * problem again later brings it back). Settings: newer `updatedAt` wins.
 */
export function mergeDecks(local: ExportFile, remote: ExportFile | null, now = Date.now()): MergeResult {
  const remoteCards = new Map((remote?.cards ?? []).map((c) => [c.id, c]));
  const localCards = new Map(local.cards.map((c) => [c.id, c]));

  const deleted: Record<string, number> = { ...remote?.deleted };
  for (const [id, at] of Object.entries(local.deleted ?? {})) deleted[id] = Math.max(at, deleted[id] ?? 0);

  const cards: Card[] = [];
  const localWrites: Card[] = [];
  const localRemovals: string[] = [];
  for (const id of new Set([...localCards.keys(), ...remoteCards.keys()])) {
    const mine = localCards.get(id);
    const theirs = remoteCards.get(id);
    const winner = !theirs || (mine && changedAt(mine) >= changedAt(theirs)) ? mine! : theirs;
    if ((deleted[id] ?? -Infinity) >= changedAt(winner)) {
      if (mine) localRemovals.push(id);
      continue;
    }
    // A card newer than its tombstone was re-added; the tombstone no longer applies.
    delete deleted[id];
    cards.push(winner);
    if (winner !== mine) localWrites.push(winner);
  }
  cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const remoteSettingsNewer = !!remote && (remote.settings?.updatedAt ?? 0) > (local.settings.updatedAt ?? 0);
  const settings = remoteSettingsNewer ? remote.settings : local.settings;

  const deck: ExportFile = { app: 'memcode', version: 2, exportedAt: now, settings, cards, deleted };
  return {
    deck,
    localWrites,
    localRemovals,
    localSettings: remoteSettingsNewer ? remote.settings : undefined,
    remoteChanged: !remote || fingerprint(deck) !== fingerprint(remote),
  };
}

/** Everything that matters for "did the deck change", ignoring exportedAt. */
function fingerprint(file: ExportFile): string {
  const cards = file.cards.map((c) => `${c.id}@${changedAt(c)}`).sort();
  const deleted = Object.entries(file.deleted ?? {})
    .map(([id, at]) => `${id}@${at}`)
    .sort();
  return JSON.stringify([file.version, file.settings?.updatedAt ?? 0, cards, deleted]);
}
