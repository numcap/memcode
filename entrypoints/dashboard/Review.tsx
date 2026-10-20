import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DifficultyPill } from '@/components/DifficultyPill';
import { NotesEditor } from '@/components/NotesEditor';
import { ProblemHtml } from '@/components/ProblemHtml';
import { RatingButtons } from '@/components/RatingButtons';
import { SubmissionView } from '@/components/SubmissionView';
import { recordReview } from '@/lib/capture';
import { daysSinceLabel, dueLabel, RATING_LABELS, sourceName } from '@/lib/format';
import { previewIntervals } from '@/lib/srs';
import { buildQueue, getAllCards, getSettings, isDue } from '@/lib/storage';
import { RATINGS, type Card, type Rating, type Settings } from '@/lib/types';
import { cardHref, useCards } from './hooks';

const AHEAD_BATCH = 10;

interface Session {
  queue: Card[];
  mode: 'due' | 'single' | 'ahead';
  settings: Settings;
}

export function Review({ cardParam }: { cardParam: string | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });

  const start = useCallback(
    async (mode: Session['mode']) => {
      const [deck, settings] = await Promise.all([getAllCards(), getSettings()]);
      let queue: Card[];
      if (mode === 'single') queue = deck.filter((c) => c.id === cardParam);
      else if (mode === 'ahead')
        queue = deck
          .filter((c) => !isDue(c))
          .sort((a, b) => a.srs.due - b.srs.due)
          .slice(0, AHEAD_BATCH);
      else queue = buildQueue(deck, settings);
      // The queue is a snapshot: rating a card mustn't reshuffle the session.
      setSession({ queue, mode, settings });
      setIndex(0);
      setRevealed(false);
      setTally({ 1: 0, 2: 0, 3: 0, 4: 0 });
    },
    [cardParam],
  );

  useEffect(() => {
    start(cardParam ? 'single' : 'due');
  }, [start, cardParam]);

  const current = session?.queue[index];

  const intervals = useMemo(
    () => (current && session ? previewIntervals(current.srs, session.settings.retention) : undefined),
    [current, session],
  );

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        await recordReview(current.id, rating);
        setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
        setIndex((i) => i + 1);
        setRevealed(false);
        window.scrollTo(0, 0);
      } finally {
        setBusy(false);
      }
    },
    [current, busy],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest('textarea, input, select')) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      if (!current || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        rate(Number(e.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, rate]);

  if (!session) return <div className="page-loading">Loading…</div>;

  if (!current) {
    return <SessionEnd session={session} tally={tally} onStart={start} />;
  }

  return (
    <div className="review">
      <div className="review-progress" aria-label={`Card ${index + 1} of ${session.queue.length}`}>
        <div className="review-progress-bar" style={{ width: `${(index / session.queue.length) * 100}%` }} />
      </div>
      <div className="review-count">
        {session.mode === 'ahead' ? 'Reviewing ahead · ' : ''}
        {index + 1} / {session.queue.length}
      </div>
      <ReviewCard
        key={current.id}
        card={current}
        revealed={revealed}
        hideTags={session.settings.hideTagsOnFront}
        onReveal={() => setRevealed(true)}
      />
      {revealed && (
        <div className="rate-bar">
          <div className="rate-bar-inner">
            <RatingButtons intervals={intervals} onRate={rate} disabled={busy} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  card,
  revealed,
  hideTags,
  onReveal,
}: {
  card: Card;
  revealed: boolean;
  hideTags: boolean;
  onReveal: () => void;
}) {
  const [tagsVisible, setTagsVisible] = useState(!hideTags);
  const showTags = tagsVisible || revealed;
  const answerRef = useRef<HTMLElement>(null);

  // The answer sits below a possibly long problem statement; bring it into view.
  useEffect(() => {
    if (revealed) answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [revealed]);
  return (
    <article className="review-card">
      <header className="review-header">
        <div className="eyebrow">
          {sourceName(card.source)} · last seen {daysSinceLabel(card.lastSeenAt)} · rated {card.reviewLog.length}×
        </div>
        <h1>
          {card.frontendId && <span className="muted">{card.frontendId}. </span>}
          {card.title}
        </h1>
        <div className="meta-row">
          <DifficultyPill difficulty={card.difficulty} />
          {card.tags.length > 0 &&
            (showTags ? (
              card.tags.map((t) => (
                <span key={t} className="mc-pill">
                  {t}
                </span>
              ))
            ) : (
              <button type="button" className="link-button" onClick={() => setTagsVisible(true)}>
                Show topics (spoiler)
              </button>
            ))}
        </div>
      </header>

      <details className="panel" open>
        <summary>Problem</summary>
        <ProblemHtml html={card.descriptionHtml} />
      </details>

      <section className="panel recall">
        <h2>Recall before you reveal</h2>
        <ul>
          <li>Which pattern solves it, and what tipped you off?</li>
          <li>What's the key insight or invariant?</li>
          <li>Time and space complexity?</li>
          <li>Sketch the code: data structures, loop shape, edge cases.</li>
        </ul>
        <textarea
          className="mc-textarea scratch"
          rows={5}
          spellCheck={false}
          placeholder="Think it through or jot your answer here. This scratch pad isn't saved."
        />
      </section>

      {!revealed ? (
        <div className="reveal-row">
          <button type="button" className="mc-btn mc-btn-primary reveal-btn" onClick={onReveal}>
            Show answer <kbd>Space</kbd>
          </button>
        </div>
      ) : (
        <section className="answer" ref={answerRef}>
          <div className="panel">
            <h2>Your key insight</h2>
            <NotesEditor card={card} rows={3} />
          </div>
          <div className="panel">
            <h2>Your solution</h2>
            <SubmissionView submissions={card.submissions} />
          </div>
          <div className="answer-links">
            <a href={card.url} target="_blank" rel="noopener noreferrer">
              Re-solve on {sourceName(card.source)} ↗
            </a>
            <a href={cardHref(card.id)}>Card details</a>
          </div>
        </section>
      )}
    </article>
  );
}

function SessionEnd({
  session,
  tally,
  onStart,
}: {
  session: Session;
  tally: Record<Rating, number>;
  onStart: (mode: Session['mode']) => void;
}) {
  // Read the live deck: cards rated this session now have new due dates.
  const { cards: deck } = useCards();
  if (!deck) return null;

  const reviewed = RATINGS.reduce((n, r) => n + tally[r], 0);
  const { settings, mode } = session;

  if (!deck.length) {
    return (
      <div className="empty-state">
        <h1>Your deck is empty</h1>
        <p>
          Solve a problem on LeetCode or NeetCode. When it's accepted, MemCode asks how hard it was and adds it here.
          You can also click <strong>Save to MemCode</strong> at the bottom-left of any problem page.
        </p>
      </div>
    );
  }

  const now = Date.now();
  const stillDue = buildQueue(deck, settings, now).length;
  const capped = stillDue === 0 && deck.some((c) => isDue(c, now));
  const upcoming = deck.filter((c) => !isDue(c, now)).sort((a, b) => a.srs.due - b.srs.due);

  return (
    <div className="empty-state">
      <h1>{reviewed ? 'Session complete' : 'Nothing due right now'}</h1>
      {reviewed > 0 && (
        <>
          <p>
            You reviewed {reviewed} problem{reviewed === 1 ? '' : 's'}.
          </p>
          <div className="tally">
            {RATINGS.map((r) => (
              <span key={r} className={`tally-item tally-${r}`}>
                {RATING_LABELS[r]} <strong>{tally[r]}</strong>
              </span>
            ))}
          </div>
        </>
      )}
      {capped && (
        <p className="muted">
          You've hit today's limit of {settings.maxReviewsPerDay} reviews. You can raise it in{' '}
          <a href="#/settings">Settings</a>.
        </p>
      )}
      {mode === 'single' && session.queue[0] && (
        <p>
          <a href={cardHref(session.queue[0].id)}>Back to {session.queue[0].title}</a>
        </p>
      )}
      {upcoming[0] && (
        <p className="muted">
          Next up: <a href={cardHref(upcoming[0].id)}>{upcoming[0].title}</a>, due {dueLabel(upcoming[0].srs.due, now)}.
        </p>
      )}
      <div className="empty-actions">
        {stillDue > 0 ? (
          <button type="button" className="mc-btn mc-btn-primary" onClick={() => onStart('due')}>
            Review {stillDue} due
          </button>
        ) : (
          upcoming.length > 0 &&
          !capped && (
            <button type="button" className="mc-btn" onClick={() => onStart('ahead')}>
              Review ahead ({Math.min(AHEAD_BATCH, upcoming.length)} due soonest)
            </button>
          )
        )}
        <a className="mc-btn" href="#/library">
          Go to library
        </a>
      </div>
    </div>
  );
}
