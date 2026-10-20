import { describe, expect, it } from 'vitest';
import { deserialize, newSrsState, previewIntervals, rate, serialize } from '@/lib/srs';

const DAY = 86_400_000;
const now = new Date('2026-10-02T12:00:00Z');

describe('srs', () => {
  it('schedules a first "Good" solve days out, not minutes', () => {
    const next = rate(newSrsState(now), 3, 0.9, now);
    expect(next.due - now.getTime()).toBeGreaterThanOrEqual(2 * DAY);
    expect(next.reps).toBe(1);
  });

  it('orders preview intervals Again < Hard < Good < Easy', () => {
    const iv = previewIntervals(undefined, 0.9, now);
    expect(iv[1]).toBeLessThan(iv[2]);
    expect(iv[2]).toBeLessThan(iv[3]);
    expect(iv[3]).toBeLessThan(iv[4]);
    expect(iv[1]).toBeGreaterThanOrEqual(DAY - 1);
  });

  it('counts a lapse and shortens the interval when a review is forgotten', () => {
    let state = rate(newSrsState(now), 3, 0.9, now);
    const reviewAt = new Date(state.due);
    state = rate(state, 3, 0.9, reviewAt);
    const goodInterval = state.scheduled_days;
    const forgotAt = new Date(state.due);
    const lapsed = rate(state, 1, 0.9, forgotAt);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.scheduled_days).toBeLessThan(goodInterval);
  });

  it('caps intervals at a year', () => {
    let state = newSrsState(now);
    let at = now;
    for (let i = 0; i < 12; i++) {
      state = rate(state, 4, 0.9, at);
      at = new Date(state.due);
    }
    expect(state.scheduled_days).toBeLessThanOrEqual(365);
  });

  it('round-trips through serialize/deserialize', () => {
    const state = rate(newSrsState(now), 2, 0.9, now);
    expect(serialize(deserialize(state))).toEqual(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
