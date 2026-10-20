import { useEffect, useState } from 'react';
import { updateCard } from '@/lib/storage';
import type { Card } from '@/lib/types';

/** Inline notes editor that saves on blur. */
export function NotesEditor({ card, rows = 4 }: { card: Card; rows?: number }) {
  const [value, setValue] = useState(card.notes);
  const [saved, setSaved] = useState(false);

  useEffect(() => setValue(card.notes), [card.id, card.notes]);

  const commit = async () => {
    const notes = value.trim();
    if (notes === card.notes) return;
    await updateCard(card.id, (c) => ({ ...c, notes }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="notes-editor">
      <textarea
        className="mc-textarea"
        rows={rows}
        value={value}
        placeholder="No key insight yet. What's the trick to this problem?"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
      />
      <span className="notes-status" aria-live="polite">
        {saved ? 'Saved' : ''}
      </span>
    </div>
  );
}
