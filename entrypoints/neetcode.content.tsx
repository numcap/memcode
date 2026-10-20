import { defineContentScript } from 'wxt/utils/define-content-script';
import { startCapture } from '@/components/startCapture';
import type { NeetcodeMeta } from '@/lib/hook';
import { fetchNeetcodeMeta, problemFromMeta, readEditorCode } from '@/lib/neetcode';

// Matches the whole site (not just /problems/*) because NeetCode navigates client-side.
export default defineContentScript({
  matches: ['https://neetcode.io/*'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  main(ctx) {
    // Metadata NeetCode's own page fetched (includes the user's submission history when logged in).
    const metaCache = new Map<string, NeetcodeMeta>();

    startCapture(ctx, {
      site: 'neetcode',
      onHookEvent(event) {
        if (event.type === 'neetcode-meta') metaCache.set(event.meta.id, event.meta);
      },
      async loadProblem(slug) {
        let meta = metaCache.get(slug);
        if (!meta) {
          meta = await fetchNeetcodeMeta(slug);
          metaCache.set(slug, meta);
        }
        return problemFromMeta(meta);
      },
      async loadLatestCode(slug) {
        const accepted = metaCache.get(slug)?.latestAccepted;
        if (accepted) return { code: accepted.code, lang: accepted.lang, at: accepted.at || Date.now() };
        return readEditorCode(localStorage, slug);
      },
    });
  },
});
