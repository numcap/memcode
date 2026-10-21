import { marked } from 'marked';
import { useState, type FormEvent } from 'react';
import { ProblemHtml } from '@/components/ProblemHtml';
import { RatingButtons } from '@/components/RatingButtons';
import { PageSkeleton } from '@/components/Skeleton';
import { upsertFromSolve } from '@/lib/capture';
import { langName, sourceName } from '@/lib/format';
import { lookUpProblem, parseProblemRef, slugify } from '@/lib/lookup';
import { previewIntervals } from '@/lib/srs';
import { cardId } from '@/lib/storage';
import type { Card, Difficulty, Problem, Rating, Source } from '@/lib/types';
import { cardHref, useCards, useSettings } from './hooks';

const LANGS = ['python3', 'java', 'cpp', 'c', 'csharp', 'javascript', 'typescript', 'golang', 'rust', 'kotlin', 'swift', 'ruby', 'scala', 'php', 'dart', 'mysql', 'postgresql'];
const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard', 'Unknown'];

interface Draft {
  source: Source;
  title: string;
  url: string;
  frontendId: string;
  difficulty: Difficulty;
  tags: string;
  /** Markdown typed by hand. Ignored when `fetched` has the site's own statement. */
  description: string;
  notes: string;
  code: string;
  lang: string;
  /** The problem as the site returned it, when looked up. */
  fetched?: Problem;
}

const EMPTY: Draft = {
  source: 'other',
  title: '',
  url: '',
  frontendId: '',
  difficulty: 'Unknown',
  tags: '',
  description: '',
  notes: '',
  code: '',
  lang: 'python3',
};

function draftFrom(problem: Problem, prev: Draft): Draft {
  return {
    ...prev,
    source: problem.source,
    title: problem.title,
    url: problem.url,
    frontendId: problem.frontendId ?? '',
    difficulty: problem.difficulty,
    tags: problem.tags.join(', '),
    description: '',
    fetched: problem,
  };
}

/** Only http(s) links: the URL ends up in an href. */
function cleanUrl(input: string): string {
  const url = input.trim();
  if (!url) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("That link doesn't look like a web address.");
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('Links must start with http or https.');
  return parsed.href;
}

/** A slug that doesn't collide with a different problem already in the deck. */
function uniqueSlug(base: string, source: Source, cards: Card[]): string {
  const taken = new Set(cards.filter((c) => c.source === source).map((c) => c.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function AddProblem() {
  const { cards } = useCards();
  const [settings] = useSettings();
  const [ref, setRef] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState<'lookup' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  if (!cards || !settings) return <PageSkeleton variant="panels" />;

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  // The card this would update: a looked-up problem keeps its site slug, so re-adding one you
  // already have re-rates it instead of making a duplicate.
  const existing = draft.fetched
    ? cards.find((c) => c.id === cardId(draft.fetched!.source, draft.fetched!.slug))
    : undefined;

  const onLookup = async (e: FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    const parsed = parseProblemRef(ref);
    if (!parsed) {
      setLookupError('Enter a LeetCode number like 42, or a LeetCode or NeetCode link.');
      return;
    }
    setBusy('lookup');
    try {
      const problem = await lookUpProblem(parsed);
      setDraft((d) => draftFrom(problem, d));
    } catch (err) {
      setLookupError(
        `${err instanceof Error ? err.message : String(err)} You can still fill in the details below by hand.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const buildProblem = (): Problem => {
    const title = draft.title.trim();
    if (!title) throw new Error('Give the problem a title.');
    const url = cleanUrl(draft.url);
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (draft.fetched) {
      return { ...draft.fetched, title, url: url || draft.fetched.url, difficulty: draft.difficulty, tags };
    }
    // Typed by hand. A LeetCode/NeetCode link still gives the real slug, so a later
    // capture on that site updates this card instead of adding a second one.
    const fromLink = draft.source !== 'other' ? parseProblemRef(url) : null;
    const slug =
      fromLink && 'slug' in fromLink && fromLink.site === draft.source
        ? fromLink.slug
        : uniqueSlug(slugify(title), draft.source, cards);
    const description = draft.description.trim();
    return {
      source: draft.source,
      slug,
      title,
      url,
      difficulty: draft.difficulty,
      tags,
      descriptionHtml: description ? (marked.parse(description, { async: false }) as string) : '',
      ...(draft.source === 'leetcode' && draft.frontendId.trim() && { frontendId: draft.frontendId.trim() }),
    };
  };

  const onRate = async (rating: Rating) => {
    setError(null);
    let problem: Problem;
    try {
      problem = buildProblem();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    setBusy('save');
    try {
      const code = draft.code.trimEnd();
      const card = await upsertFromSolve({
        problem,
        submission: code.trim() ? { code, lang: draft.lang, at: Date.now() } : undefined,
        rating,
        // Keep notes already on the card if none were typed here.
        notes: draft.notes.trim() || existing?.notes || '',
      });
      location.hash = cardHref(card.id);
    } catch (err) {
      setError(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(null);
    }
  };

  const reset = () => {
    setDraft(EMPTY);
    setRef('');
    setError(null);
    setLookupError(null);
  };

  return (
    <div className="add-problem">
      <a href="#/library" className="back-link">
        ← Library
      </a>
      <h1>Add a problem</h1>

      <section className="panel">
        <h2>Look it up</h2>
        <form className="lookup-form" onSubmit={onLookup}>
          <input
            className="input"
            placeholder="42, or a leetcode.com / neetcode.io link"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            autoFocus
            spellCheck={false}
            aria-label="LeetCode number or problem link"
          />
          <button type="submit" className="mc-btn mc-btn-primary" disabled={busy !== null}>
            {busy === 'lookup' ? (
              <>
                <span className="mc-spinner" aria-hidden /> Looking up…
              </>
            ) : (
              'Look up'
            )}
          </button>
        </form>
        <p className="setting-help">
          Fills in the title, difficulty, topics and problem statement. For a problem from anywhere else, skip this and
          fill in the details below.
        </p>
        {lookupError && <p className="error">{lookupError}</p>}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Details</h2>
          {(draft.fetched || draft.title) && (
            <button type="button" className="mc-btn mc-btn-ghost" onClick={reset}>
              Start over
            </button>
          )}
        </div>

        {draft.fetched ? (
          <p className="setting-help">
            From {sourceName(draft.fetched.source)}
            {draft.fetched.frontendId && ` · #${draft.fetched.frontendId}`}.{' '}
            {existing && (
              <>
                <strong>Already in your deck</strong> (<a href={cardHref(existing.id)}>open it</a>). Saving rates it
                again and keeps its history.
              </>
            )}
          </p>
        ) : (
          <label className="field">
            <span className="field-label">Source</span>
            <select
              className="input"
              value={draft.source}
              onChange={(e) => set({ source: e.target.value as Source })}
            >
              <option value="other">Other (any site, book or interview)</option>
              <option value="leetcode">LeetCode</option>
              <option value="neetcode">NeetCode</option>
            </select>
          </label>
        )}

        <div className="field-row">
          {draft.source === 'leetcode' && !draft.fetched && (
            <label className="field field-narrow">
              <span className="field-label">Number</span>
              <input
                className="input"
                inputMode="numeric"
                value={draft.frontendId}
                onChange={(e) => set({ frontendId: e.target.value.replace(/\D/g, '') })}
              />
            </label>
          )}
          <label className="field field-grow">
            <span className="field-label">Title</span>
            <input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field field-narrow">
            <span className="field-label">Difficulty</span>
            <select
              className="input"
              value={draft.difficulty}
              onChange={(e) => set({ difficulty: e.target.value as Difficulty })}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d === 'Unknown' ? '—' : d}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">Link {draft.source === 'other' && <span className="muted">(optional)</span>}</span>
          <input
            className="input"
            placeholder="https://…"
            value={draft.url}
            onChange={(e) => set({ url: e.target.value })}
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span className="field-label">
            Topics <span className="muted">(comma-separated)</span>
          </span>
          <input
            className="input"
            placeholder="Array, Two Pointers"
            value={draft.tags}
            onChange={(e) => set({ tags: e.target.value })}
          />
        </label>

        {draft.fetched ? (
          <details className="field statement-preview">
            <summary className="field-label">Problem statement</summary>
            <ProblemHtml html={draft.fetched.descriptionHtml} />
          </details>
        ) : (
          <label className="field">
            <span className="field-label">
              Problem statement <span className="muted">(optional, Markdown)</span>
            </span>
            <textarea
              className="mc-textarea"
              rows={5}
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </label>
        )}
      </section>

      <section className="panel">
        <h2>Your answer</h2>
        <label className="field">
          <span className="field-label">Key insight</span>
          <textarea
            className="mc-textarea"
            rows={3}
            placeholder="The one idea that cracks it, e.g. hash map from value to index"
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
        <div className="field">
          <div className="field-row field-row-center">
            <span className="field-label">
              Solution <span className="muted">(optional)</span>
            </span>
            <select
              className="input input-small"
              value={draft.lang}
              onChange={(e) => set({ lang: e.target.value })}
              aria-label="Language"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {langName(l)}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="mc-textarea mc-textarea-code"
            rows={8}
            spellCheck={false}
            value={draft.code}
            onChange={(e) => set({ code: e.target.value })}
            aria-label="Solution code"
          />
        </div>
      </section>

      <section className="panel">
        <h2>How hard was it?</h2>
        <RatingButtons
          intervals={previewIntervals(existing?.srs, settings.retention)}
          onRate={onRate}
          disabled={busy !== null}
          idleHint="Pick one to save the problem and schedule its first review"
        />
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
