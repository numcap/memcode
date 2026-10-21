import { useId } from 'react';

/** The ReMCode mark: a code flashcard in front of the next one. Same drawing as docs/logo/logo.svg. */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  // Gradient and filter ids must be unique per document; useId's colons aren't valid in url(#…).
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 128 128" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7676F2" />
          <stop offset="1" stopColor="#4646C0" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1E1E66" floodOpacity=".28" />
        </filter>
      </defs>
      <rect width="128" height="128" rx="28" fill={`url(#${id}-bg)`} />
      <rect x="39" y="19" width="68" height="56" rx="11" fill="#fff" fillOpacity=".42" transform="rotate(9 73 47)" />
      <g transform="rotate(-4 57 73)" filter={`url(#${id}-shadow)`}>
        <rect x="18" y="40" width="78" height="66" rx="12" fill="#fff" />
        <g fill="none" stroke="#5B5BD6" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M43 61 L31.5 73 L43 85" />
          <path d="M71 61 L82.5 73 L71 85" />
          <path d="M62.5 57.5 L51.5 88.5" />
        </g>
      </g>
    </svg>
  );
}
