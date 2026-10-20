import { useState } from 'react';
import { formatInterval, RATING_HINTS, RATING_LABELS } from '@/lib/format';
import { RATINGS, type Rating } from '@/lib/types';

interface Props {
  intervals?: Record<Rating, number>;
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

export function RatingButtons({ intervals, onRate, disabled }: Props) {
  const [hovered, setHovered] = useState<Rating | null>(null);
  return (
    <div>
      <div className="mc-ratings">
        {RATINGS.map((r) => (
          <button
            key={r}
            type="button"
            className={`mc-rating mc-rating-${r}`}
            disabled={disabled}
            title={RATING_HINTS[r]}
            onClick={() => onRate(r)}
            onMouseEnter={() => setHovered(r)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(r)}
            onBlur={() => setHovered(null)}
          >
            <span className="mc-rating-label">{RATING_LABELS[r]}</span>
            <span className="mc-rating-interval">{intervals ? formatInterval(intervals[r]) : '—'}</span>
            <span className="mc-rating-key">{r}</span>
          </button>
        ))}
      </div>
      <p className="mc-rating-hint">{hovered ? RATING_HINTS[hovered] : 'Press 1–4 to rate'}</p>
    </div>
  );
}
