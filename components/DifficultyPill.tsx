import type { Difficulty } from '@/lib/types';

export function DifficultyPill({ difficulty }: { difficulty: Difficulty }) {
  if (difficulty === 'Unknown') return null;
  return <span className={`mc-pill mc-pill-${difficulty.toLowerCase()}`}>{difficulty}</span>;
}
