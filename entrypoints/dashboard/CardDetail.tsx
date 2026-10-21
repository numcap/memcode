import { DifficultyPill } from '@/components/DifficultyPill';
import { NotesEditor } from '@/components/NotesEditor';
import { ProblemHtml } from '@/components/ProblemHtml';
import { PageSkeleton } from '@/components/Skeleton';
import { SubmissionView } from '@/components/SubmissionView';
import { daysSinceLabel, dueLabel, formatDate, RATING_LABELS, sourceName } from '@/lib/format';
import { newSrsState } from '@/lib/srs';
import { deleteCard, updateCard } from '@/lib/storage';
import { useCards, useNow } from './hooks';

export function CardDetail({ id }: { id: string }) {
  const { cards } = useCards();
  const now = useNow();
  if (!cards) return <PageSkeleton variant="detail" />;
  const card = cards.find((c) => c.id === id);
  if (!card) {
    return (
      <div className="empty-state">
        <h1>Card not found</h1>
        <p>
          It may have been deleted. <a href="#/library">Back to library</a>
        </p>
      </div>
    );
  }

  const resetSchedule = async () => {
    if (!confirm(`Reset the schedule for "${card.title}"? It will be treated as a new card and due today.`)) return;
    await updateCard(card.id, (c) => ({ ...c, srs: newSrsState() }));
  };

  const remove = async () => {
    if (!confirm(`Delete "${card.title}" and its notes, code, and history? This can't be undone.`)) return;
    await deleteCard(card.id);
    location.hash = '#/library';
  };

  const stats: [string, string][] = [
    ['Next review', dueLabel(card.srs.due, now)],
    ['Last seen', daysSinceLabel(card.lastSeenAt, now)],
    ['Added', formatDate(card.createdAt)],
    ['Reps', String(card.srs.reps)],
    ['Lapses', String(card.srs.lapses)],
    ['Stability', card.srs.reps ? `${card.srs.stability.toFixed(1)} days` : '—'],
  ];

  return (
    <div className="card-detail">
      <a href="#/library" className="back-link">
        ← Library
      </a>
      <header className="detail-header">
        <div className="eyebrow">{sourceName(card.source)}</div>
        <h1>
          {card.frontendId && <span className="muted">{card.frontendId}. </span>}
          {card.title}
        </h1>
        <div className="meta-row">
          <DifficultyPill difficulty={card.difficulty} />
          {card.tags.map((t) => (
            <span key={t} className="mc-pill">
              {t}
            </span>
          ))}
        </div>
        <div className="detail-actions">
          <a className="mc-btn mc-btn-primary" href={`#/review?card=${encodeURIComponent(card.id)}`}>
            Review now
          </a>
          {card.url && (
            <a className="mc-btn" href={card.url} target="_blank" rel="noopener noreferrer">
              {card.source === 'other' ? 'Open link' : `Open on ${sourceName(card.source)}`} ↗
            </a>
          )}
          <button type="button" className="mc-btn" onClick={resetSchedule}>
            Reset schedule
          </button>
          <button type="button" className="mc-btn mc-btn-danger" onClick={remove}>
            Delete
          </button>
        </div>
      </header>

      <dl className="detail-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="panel">
        <h2>Key insight</h2>
        <NotesEditor card={card} />
      </section>

      <section className="panel">
        <h2>Your solution{card.submissions.length > 1 ? 's' : ''}</h2>
        <SubmissionView submissions={card.submissions} />
      </section>

      <details className="panel">
        <summary>Problem</summary>
        <ProblemHtml html={card.descriptionHtml} />
      </details>

      <section className="panel">
        <h2>History</h2>
        {card.reviewLog.length === 0 ? (
          <p className="muted">Not rated yet.</p>
        ) : (
          <ol className="history">
            {[...card.reviewLog].reverse().map((entry, i) => (
              <li key={`${entry.at}-${i}`}>
                <span className={`history-rating tally-${entry.rating}`}>{RATING_LABELS[entry.rating]}</span>
                <span>{entry.kind === 'solve' ? 'Solved' : 'Reviewed'}</span>
                <span className="muted">
                  {new Date(entry.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {entry.recall && <pre className="history-recall">{entry.recall}</pre>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
