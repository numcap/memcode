import { useState } from 'react';
import { formatDate, langName } from '@/lib/format';
import type { Submission } from '@/lib/types';
import { CodeBlock } from './CodeBlock';

/** Shows one saved solution at a time, with a switcher when there are several. */
export function SubmissionView({ submissions }: { submissions: Submission[] }) {
  const [selected, setSelected] = useState(0);
  const current = submissions[Math.min(selected, submissions.length - 1)];
  if (!current) return <p className="muted">No code saved for this problem.</p>;
  const meta = [langName(current.lang), current.runtime, current.memory, formatDate(current.at)].filter(Boolean);
  return (
    <div className="submission">
      {submissions.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Saved solutions">
          {submissions.map((s, i) => (
            <button
              key={`${s.at}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
            >
              {i === 0 ? 'Latest' : formatDate(s.at)} · {langName(s.lang)}
            </button>
          ))}
        </div>
      )}
      <div className="submission-meta">{meta.join(' · ')}</div>
      <CodeBlock code={current.code} lang={current.lang} />
    </div>
  );
}
