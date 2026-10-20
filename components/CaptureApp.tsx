import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { browser } from 'wxt/browser';
import { upsertFromSolve } from '@/lib/capture';
import { daysSinceLabel, dueLabel, langName } from '@/lib/format';
import { problemSlugFromPath, type AcceptedEvent, type HookEvent } from '@/lib/hook';
import { previewIntervals } from '@/lib/srs';
import { cardId, getCard, getSettings } from '@/lib/storage';
import type { Card, Problem, Rating, Source, Submission } from '@/lib/types';
import { DifficultyPill } from './DifficultyPill';
import { RatingButtons } from './RatingButtons';

export interface SiteAdapter {
  site: Source;
  loadProblem(slug: string): Promise<Problem>;
  /** Best-effort code for when the hook didn't capture it (manual save, missed request). */
  loadLatestCode(slug: string): Promise<Submission | undefined>;
  /** Lets an adapter cache data the page hook observed (e.g. NeetCode metadata). */
  onHookEvent?(event: HookEvent): void;
}

interface Props {
  adapter: SiteAdapter;
  onLocationChange(callback: (url: URL) => void): void;
  /** Accepted submissions observed by the page hook; returns an unsubscribe function. */
  subscribeAccepted(callback: (event: AcceptedEvent) => void): () => void;
}

type Trigger = 'accepted' | 'manual';

interface Draft {
  trigger: Trigger;
  problem: Problem;
  existing?: Card;
  code: string;
  lang: string;
  runtime?: string;
  memory?: string;
  notes: string;
  intervals: Record<Rating, number>;
}

type View =
  | { kind: 'closed' }
  | { kind: 'loading'; trigger: Trigger }
  | { kind: 'draft'; draft: Draft; saving: boolean; error?: string }
  | { kind: 'saved'; card: Card };

export function CaptureApp({ adapter, onLocationChange, subscribeAccepted }: Props) {
  const [slug, setSlug] = useState(() => problemSlugFromPath(location.pathname));
  const [view, setView] = useState<View>({ kind: 'closed' });
  const [theme, setTheme] = useState(detectPageTheme);
  const [savedHere, setSavedHere] = useState<Card | undefined>();
  const openToken = useRef(0);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onLocationChange((url) => setSlug(problemSlugFromPath(url.pathname)));
  }, [onLocationChange]);

  useEffect(() => {
    setSavedHere(undefined);
    if (slug) getCard(cardId(adapter.site, slug)).then(setSavedHere);
  }, [adapter.site, slug]);

  const close = useCallback(() => {
    openToken.current++;
    setView({ kind: 'closed' });
  }, []);

  const open = useCallback(
    async (problemSlug: string, trigger: Trigger, captured?: Submission) => {
      const token = ++openToken.current;
      setTheme(detectPageTheme());
      setView({ kind: 'loading', trigger });
      const [problem, existing, settings, fetched] = await Promise.all([
        adapter.loadProblem(problemSlug).catch(() => fallbackProblem(adapter.site, problemSlug)),
        getCard(cardId(adapter.site, problemSlug)),
        getSettings(),
        captured?.code ? undefined : adapter.loadLatestCode(problemSlug).catch(() => undefined),
      ]);
      if (token !== openToken.current) return;
      const submission = captured?.code ? captured : (fetched ?? captured);
      setView({
        kind: 'draft',
        saving: false,
        draft: {
          trigger,
          problem,
          existing,
          code: submission?.code ?? '',
          lang: submission?.lang || existing?.submissions[0]?.lang || '',
          runtime: submission?.runtime,
          memory: submission?.memory,
          notes: existing?.notes ?? '',
          intervals: previewIntervals(existing?.srs, settings.retention),
        },
      });
    },
    [adapter],
  );

  useEffect(
    () =>
      subscribeAccepted(async (event) => {
        const settings = await getSettings();
        if (!settings.autoPrompt[adapter.site]) return;
        const captured = event.code
          ? { code: event.code, lang: event.lang ?? '', at: Date.now(), runtime: event.runtime, memory: event.memory }
          : undefined;
        open(event.slug, 'accepted', captured);
      }),
    [adapter, open, subscribeAccepted],
  );

  useEffect(() => {
    if (view.kind === 'draft' && !view.saving) modalRef.current?.focus();
  }, [view.kind]);

  useEffect(() => {
    if (view.kind !== 'saved') return;
    const timer = setTimeout(close, 6000);
    return () => clearTimeout(timer);
  }, [view, close]);

  const updateDraft = (patch: Partial<Draft>) =>
    setView((v) => (v.kind === 'draft' ? { ...v, draft: { ...v.draft, ...patch } } : v));

  const save = async (rating: Rating) => {
    if (view.kind !== 'draft' || view.saving) return;
    const { draft } = view;
    setView({ ...view, saving: true, error: undefined });
    try {
      const code = draft.code.trimEnd();
      const card = await upsertFromSolve({
        problem: draft.problem,
        submission: code.trim()
          ? { code, lang: draft.lang || 'text', at: Date.now(), runtime: draft.runtime, memory: draft.memory }
          : undefined,
        rating,
        notes: draft.notes.trim(),
      });
      setSavedHere(card);
      setView({ kind: 'saved', card });
    } catch (err) {
      setView({ ...view, saving: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const onModalKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const typing = (e.target as HTMLElement).closest('textarea, input');
    if (e.key === 'Escape') {
      e.preventDefault();
      if (typing) modalRef.current?.focus();
      else close();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      save(Number(e.key) as Rating);
    }
  };

  const openDashboard = (hash: string) => {
    browser.runtime.sendMessage({ type: 'open-dashboard', hash }).catch(() => {});
  };

  return (
    <div className="mc-theme mc-capture" data-theme={theme}>
      {slug && view.kind === 'closed' && (
        <button
          type="button"
          className={`mc-fab${savedHere ? ' mc-fab-saved' : ''}`}
          onClick={() => open(slug, 'manual')}
          title={
            savedHere
              ? `In MemCode · next review ${dueLabel(savedHere.srs.due)} · click to re-rate`
              : 'Save this problem to MemCode'
          }
        >
          <span className="mc-fab-mark" aria-hidden>
            M
          </span>
          <span className="mc-fab-text">{savedHere ? 'In MemCode' : 'Save to MemCode'}</span>
        </button>
      )}

      {(view.kind === 'loading' || view.kind === 'draft') && (
        <div className="mc-backdrop">
          <div
            ref={modalRef}
            className="mc-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Save to MemCode"
            tabIndex={-1}
            onKeyDown={onModalKeyDown}
          >
            {view.kind === 'loading' ? (
              <div className="mc-modal-loading">Loading problem…</div>
            ) : (
              <DraftForm
                view={view}
                onChange={updateDraft}
                onRate={save}
                onSkip={close}
              />
            )}
          </div>
        </div>
      )}

      {view.kind === 'saved' && (
        <div className="mc-toast" role="status">
          <div className="mc-toast-body">
            <strong>Saved {view.card.title}</strong>
            <span>Next review {dueLabel(view.card.srs.due)}</span>
          </div>
          <button type="button" className="mc-btn" onClick={() => openDashboard(`#/card/${encodeURIComponent(view.card.id)}`)}>
            Open
          </button>
          <button type="button" className="mc-btn mc-btn-ghost" onClick={close} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function DraftForm({
  view,
  onChange,
  onRate,
  onSkip,
}: {
  view: Extract<View, { kind: 'draft' }>;
  onChange: (patch: Partial<Draft>) => void;
  onRate: (rating: Rating) => void;
  onSkip: () => void;
}) {
  const { draft, saving, error } = view;
  const { problem, existing } = draft;
  const codeMeta = [draft.lang && langName(draft.lang), draft.runtime].filter(Boolean).join(' · ');
  return (
    <>
      <header className="mc-modal-header">
        <div className="mc-eyebrow">
          {draft.trigger === 'accepted' ? <span className="mc-accepted">Accepted</span> : 'Save to MemCode'}
        </div>
        <h2 className="mc-modal-title">
          {problem.frontendId && <span className="mc-muted">{problem.frontendId}. </span>}
          {problem.title}
        </h2>
        <div className="mc-modal-meta">
          <DifficultyPill difficulty={problem.difficulty} />
          {existing ? (
            <span>
              In your deck · last seen {daysSinceLabel(existing.lastSeenAt)} · {existing.reviewLog.length}× rated
            </span>
          ) : (
            <span>New card</span>
          )}
        </div>
      </header>

      <label className="mc-field">
        <span className="mc-label">Key insight</span>
        <textarea
          className="mc-textarea"
          rows={3}
          value={draft.notes}
          placeholder="What's the trick you want to remember? e.g. hash map of value → index; check the complement before inserting. O(n) time."
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>

      <details className="mc-code" open={!draft.code}>
        <summary>
          {draft.code ? `Your solution${codeMeta ? ` · ${codeMeta}` : ''}` : 'No code captured — paste your solution (optional)'}
        </summary>
        <textarea
          className="mc-textarea mc-textarea-code"
          rows={10}
          spellCheck={false}
          value={draft.code}
          placeholder="Paste your accepted solution here"
          onChange={(e) => onChange({ code: e.target.value })}
        />
      </details>

      <div className="mc-field">
        <span className="mc-label">How hard was it?</span>
        <RatingButtons intervals={draft.intervals} onRate={onRate} disabled={saving} />
      </div>

      {error && <p className="mc-error">Couldn't save: {error}</p>}

      <footer className="mc-modal-footer">
        <span className="mc-muted">Esc to skip</span>
        <button type="button" className="mc-btn mc-btn-ghost" onClick={onSkip}>
          Skip
        </button>
      </footer>
    </>
  );
}

function fallbackProblem(source: Source, slug: string): Problem {
  return {
    source,
    slug,
    title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    url: location.href,
    difficulty: 'Unknown',
    tags: [],
    descriptionHtml: '',
  };
}

/** Match the site's current theme by the luminance of its background. */
function detectPageTheme(): 'light' | 'dark' {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m || m[4] === '0') continue;
    const luminance = 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
    return luminance < 128 ? 'dark' : 'light';
  }
  if (document.documentElement.classList.contains('dark')) return 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
