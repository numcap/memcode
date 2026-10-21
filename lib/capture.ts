import { newSrsState, rate } from './srs';
import { cardId, getCard, getSettings, saveCard, updateCard } from './storage';
import type { Card, Problem, Rating, Submission } from './types';

const MAX_SUBMISSIONS = 5;

export interface SolveInput {
  problem: Problem;
  submission?: Submission;
  rating: Rating;
  notes: string;
}

/**
 * Applies an accepted solve to a card: creates it on first solve, otherwise treats
 * the solve as a review (reschedules, keeps history) and refreshes problem metadata.
 */
export function applySolve(
  existing: Card | undefined,
  input: SolveInput,
  retention: number,
  now = Date.now(),
): Card {
  const { problem, submission, rating, notes } = input;
  const base: Card = existing ?? {
    ...problem,
    id: cardId(problem.source, problem.slug),
    notes: '',
    submissions: [],
    srs: newSrsState(new Date(now)),
    reviewLog: [],
    createdAt: now,
    lastSeenAt: now,
  };
  return {
    ...base,
    ...problem,
    // Keep richer metadata we already have if this capture came back thin.
    descriptionHtml: problem.descriptionHtml || base.descriptionHtml,
    tags: problem.tags.length ? problem.tags : base.tags,
    difficulty: problem.difficulty !== 'Unknown' ? problem.difficulty : base.difficulty,
    notes,
    submissions: submission ? addSubmission(base.submissions, submission) : base.submissions,
    srs: rate(base.srs, rating, retention, new Date(now)),
    reviewLog: [...base.reviewLog, { at: now, rating, kind: 'solve' }],
    lastSeenAt: now,
  };
}

export function applyReview(
  card: Card,
  rating: Rating,
  retention: number,
  now = Date.now(),
  recall = '',
): Card {
  const text = recall.trim();
  return {
    ...card,
    srs: rate(card.srs, rating, retention, new Date(now)),
    reviewLog: [...card.reviewLog, { at: now, rating, kind: 'review', ...(text && { recall: text }) }],
    lastSeenAt: now,
  };
}

function addSubmission(list: Submission[], next: Submission): Submission[] {
  if (!next.code.trim()) return list;
  const rest = list.filter((s) => !(s.code === next.code && s.lang === next.lang));
  return [next, ...rest].slice(0, MAX_SUBMISSIONS);
}

export async function upsertFromSolve(input: SolveInput, now = Date.now()): Promise<Card> {
  const [existing, settings] = await Promise.all([
    getCard(cardId(input.problem.source, input.problem.slug)),
    getSettings(),
  ]);
  return saveCard(applySolve(existing, input, settings.retention, now), now);
}

export async function recordReview(
  id: string,
  rating: Rating,
  now = Date.now(),
  recall = '',
): Promise<Card | undefined> {
  const settings = await getSettings();
  return updateCard(id, (card) => applyReview(card, rating, settings.retention, now, recall));
}
