export type Source = 'leetcode' | 'neetcode';
export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Unknown';

/** Anki-style grades: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Rating = 1 | 2 | 3 | 4;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

export interface Problem {
  source: Source;
  slug: string;
  title: string;
  url: string;
  difficulty: Difficulty;
  tags: string[];
  descriptionHtml: string;
  /** LeetCode's display number, e.g. "1" for Two Sum. */
  frontendId?: string;
}

export interface Submission {
  code: string;
  lang: string;
  at: number;
  runtime?: string;
  memory?: string;
}

/** ts-fsrs Card with dates stored as epoch millis so it survives chrome.storage. */
export interface SrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

export interface ReviewEntry {
  at: number;
  rating: Rating;
  /** 'solve' = rated after an accepted submission, 'review' = rated in the review screen. */
  kind: 'solve' | 'review';
  /** What you wrote in the review scratch pad before revealing the answer. */
  recall?: string;
}

export interface Card extends Problem {
  id: string;
  notes: string;
  /** Newest first. */
  submissions: Submission[];
  srs: SrsState;
  reviewLog: ReviewEntry[];
  createdAt: number;
  lastSeenAt: number;
  /** Last time anything on the card changed (notes, schedule, ...). Missing on older data; see changedAt(). */
  updatedAt?: number;
}

export interface Settings {
  /** FSRS target probability of recall at review time. */
  retention: number;
  /** 0 means unlimited. */
  maxReviewsPerDay: number;
  hideTagsOnFront: boolean;
  autoPrompt: Record<Source, boolean>;
  /** Used by sync to pick the newer settings. */
  updatedAt?: number;
}

export interface ExportFile {
  app: 'remcode';
  version: 1 | 2;
  exportedAt: number;
  settings: Settings;
  cards: Card[];
  /** Card id -> when it was deleted, so a sync doesn't bring deleted cards back. Added in version 2. */
  deleted?: Record<string, number>;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  /** Empty means the repo's default branch. */
  branch?: string;
  path: string;
}

export interface SyncStatus {
  lastSyncAt?: number;
  lastError?: string;
  /** When lastError happened. */
  errorAt?: number;
}
