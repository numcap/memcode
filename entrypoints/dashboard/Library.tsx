import { useMemo, useState } from 'react';
import { DifficultyPill } from '@/components/DifficultyPill';
import { PageSkeleton } from '@/components/Skeleton';
import { daysSinceLabel, dueLabel, sourceName } from '@/lib/format';
import { isDue, reviewsDoneToday } from '@/lib/storage';
import type { Card, Difficulty, Source } from '@/lib/types';
import { cardHref, useCards, useNow } from './hooks';

type SortKey = 'due' | 'lastSeen' | 'title' | 'lapses' | 'added';
type StatusFilter = 'all' | 'due' | 'scheduled';

const SORTERS: Record<SortKey, (a: Card, b: Card) => number> = {
  due: (a, b) => a.srs.due - b.srs.due,
  lastSeen: (a, b) => a.lastSeenAt - b.lastSeenAt,
  title: (a, b) => a.title.localeCompare(b.title),
  lapses: (a, b) => b.srs.lapses - a.srs.lapses || a.srs.due - b.srs.due,
  added: (a, b) => b.createdAt - a.createdAt,
};

export function Library() {
  const { cards } = useCards();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Source | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState<SortKey>('due');

  const allTags = useMemo(() => [...new Set((cards ?? []).flatMap((c) => c.tags))].sort(), [cards]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards ?? [])
      .filter((c) => source === 'all' || c.source === source)
      .filter((c) => difficulty === 'all' || c.difficulty === difficulty)
      .filter((c) => tag === 'all' || c.tags.includes(tag))
      .filter((c) => status === 'all' || (status === 'due') === isDue(c, now))
      .filter(
        (c) =>
          !q ||
          c.title.toLowerCase().includes(q) ||
          c.notes.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.frontendId === q,
      )
      .sort(SORTERS[sort]);
  }, [cards, query, source, difficulty, tag, status, sort, now]);

  if (!cards) return <PageSkeleton variant="library" />;

  const dueCount = cards.filter((c) => isDue(c, now)).length;

  return (
    <div className="library">
      <div className="stats">
        <Stat label="Problems" value={cards.length} />
        <Stat label="Due today" value={dueCount} href={dueCount ? '#/review' : undefined} />
        <Stat label="Reviewed today" value={reviewsDoneToday(cards, now)} />
        <Stat label="Mastered" value={cards.filter((c) => c.srs.scheduled_days >= 21).length} hint="interval ≥ 3 weeks" />
      </div>

      {cards.length === 0 ? (
        <div className="empty-state">
          <h1>No problems yet</h1>
          <p>
            Solve a problem on LeetCode or NeetCode. When it's accepted, ReMCode asks how hard it was and saves it here.
            You can also click <strong>Save to ReMCode</strong> at the bottom-left of any problem page.
          </p>
          <p>Or add one yourself: by LeetCode number, by link, or any problem from anywhere.</p>
          <div className="empty-actions">
            <a className="mc-btn mc-btn-primary" href="#/add">
              + Add a problem
            </a>
          </div>
        </div>
      ) : (
        <>
          <div className="filters">
            <input
              className="input search"
              type="search"
              placeholder="Search title, notes, topic, or #"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search"
            />
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
              <option value="all">All</option>
              <option value="due">Due</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as Source | 'all')} aria-label="Site">
              <option value="all">All sites</option>
              <option value="leetcode">LeetCode</option>
              <option value="neetcode">NeetCode</option>
              <option value="other">Other</option>
            </select>
            <select
              className="input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}
              aria-label="Difficulty"
            >
              <option value="all">Any difficulty</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <select className="input" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Topic">
              <option value="all">Any topic</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="due">Sort: next due</option>
              <option value="lastSeen">Sort: longest unseen</option>
              <option value="lapses">Sort: most forgotten</option>
              <option value="added">Sort: recently added</option>
              <option value="title">Sort: title</option>
            </select>
          </div>

          <table className="card-table">
            <thead>
              <tr>
                <th>Problem</th>
                <th className="col-difficulty">Difficulty</th>
                <th className="col-tags">Topics</th>
                <th>Last seen</th>
                <th>Next review</th>
                <th className="col-num" title="Times rated">
                  Reps
                </th>
                <th className="col-num" title="Times forgotten (rated Again on a review)">
                  Lapses
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} onClick={() => (location.hash = cardHref(c.id))}>
                  <td>
                    <a href={cardHref(c.id)} className="card-title" onClick={(e) => e.stopPropagation()}>
                      {c.frontendId && <span className="muted">{c.frontendId}. </span>}
                      {c.title}
                    </a>
                    <div className="card-sub">{sourceName(c.source)}</div>
                  </td>
                  <td className="col-difficulty">
                    <DifficultyPill difficulty={c.difficulty} />
                  </td>
                  <td className="col-tags">
                    <span className="tag-list">{c.tags.slice(0, 3).join(', ')}</span>
                  </td>
                  <td className="nowrap">{daysSinceLabel(c.lastSeenAt, now)}</td>
                  <td className={`nowrap${isDue(c, now) ? ' due' : ''}`}>{dueLabel(c.srs.due, now)}</td>
                  <td className="col-num">{c.srs.reps}</td>
                  <td className="col-num">{c.srs.lapses}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="muted center">No problems match these filters.</p>}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, href, hint }: { label: string; value: number; href?: string; hint?: string }) {
  const body = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </>
  );
  return href ? (
    <a className="stat stat-link" href={href} title={hint}>
      {body}
    </a>
  ) : (
    <div className="stat" title={hint}>
      {body}
    </div>
  );
}
