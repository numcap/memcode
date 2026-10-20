import type { Rating, Source } from './types';

const SOURCE_NAMES: Record<Source, string> = { leetcode: 'LeetCode', neetcode: 'NeetCode' };

export function sourceName(source: Source): string {
  return SOURCE_NAMES[source];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATING_LABELS: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export const RATING_HINTS: Record<Rating, string> = {
  1: "Couldn't recall the approach, or needed hints / the solution",
  2: 'Got there, but slowly or with a lot of bugs',
  3: 'Recalled the pattern with some effort',
  4: 'Could write it from memory right away',
};

/** Compact interval for rating buttons: "10m", "3h", "4d", "2.5mo", "1.1y". */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${trim(days / 30)}mo`;
  return `${trim(days / 365)}y`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Whole calendar days between `then` and `now` (local time). */
export function calendarDaysBetween(then: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(then)) / DAY);
}

export function daysSinceLabel(then: number, now = Date.now()): string {
  const days = calendarDaysBetween(then, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function dueLabel(due: number, now = Date.now()): string {
  const days = calendarDaysBetween(now, due);
  if (days < 0) return `overdue ${-days}d`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const LANG_NAMES: Record<string, string> = {
  python: 'Python',
  python3: 'Python 3',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  golang: 'Go',
  go: 'Go',
  rust: 'Rust',
  kotlin: 'Kotlin',
  swift: 'Swift',
  ruby: 'Ruby',
  scala: 'Scala',
  php: 'PHP',
  dart: 'Dart',
  elixir: 'Elixir',
  erlang: 'Erlang',
  mysql: 'MySQL',
  mssql: 'MS SQL',
  oraclesql: 'Oracle SQL',
  postgresql: 'PostgreSQL',
  sql: 'SQL',
};

export function langName(lang: string): string {
  return LANG_NAMES[lang] ?? lang;
}
