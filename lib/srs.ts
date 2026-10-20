import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs';
import type { Rating, SrsState } from './types';

// Short-term (minute-level) learning steps make no sense for coding problems:
// rating "Good" on a fresh solve should push the next look out by days, not 10 minutes.
// Intervals are capped at a year so every problem resurfaces at least annually.
function scheduler(retention: number) {
  return fsrs(
    generatorParameters({
      request_retention: retention,
      enable_fuzz: true,
      enable_short_term: false,
      maximum_interval: 365,
    }),
  );
}

export function newSrsState(now = new Date()): SrsState {
  return serialize(createEmptyCard(now));
}

export function rate(state: SrsState, rating: Rating, retention: number, now = new Date()): SrsState {
  const { card } = scheduler(retention).next(deserialize(state), now, rating as Grade);
  return serialize(card);
}

/** Milliseconds from `now` until the card would be due for each rating. */
export function previewIntervals(
  state: SrsState | undefined,
  retention: number,
  now = new Date(),
): Record<Rating, number> {
  const preview = scheduler(retention).repeat(deserialize(state ?? newSrsState(now)), now);
  const out = {} as Record<Rating, number>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    out[r] = preview[r as Grade].card.due.getTime() - now.getTime();
  }
  return out;
}

export function serialize(card: FsrsCard): SrsState {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.getTime(),
  };
}

export function deserialize(state: SrsState): FsrsCard {
  return {
    ...state,
    due: new Date(state.due),
    last_review: state.last_review == null ? undefined : new Date(state.last_review),
  };
}
