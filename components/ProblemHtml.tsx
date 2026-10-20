import DOMPurify from 'dompurify';
import { useMemo } from 'react';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Problem statements come from third-party sites, so always sanitize before rendering. */
export function ProblemHtml({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form'] }), [html]);
  if (!clean.trim()) return <p className="muted">No problem statement saved.</p>;
  return <div className="prose" dangerouslySetInnerHTML={{ __html: clean }} />;
}
