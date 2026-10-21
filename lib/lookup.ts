import { fetchLeetcodeProblem, findLeetcodeSlug } from './leetcode';
import { fetchNeetcodeMeta, problemFromMeta } from './neetcode';
import { remoteJson } from './page-fetch';
import type { Problem } from './types';

export type ProblemRef =
  | { site: 'leetcode'; number: string }
  | { site: 'leetcode'; slug: string }
  | { site: 'neetcode'; slug: string };

/**
 * Reads what someone types into "Add problem": a LeetCode number ("42", "#42"),
 * a LeetCode or NeetCode link, or a bare LeetCode slug ("two-sum").
 */
export function parseProblemRef(input: string): ProblemRef | null {
  const text = input.trim();
  const number = text.match(/^#?\s*(\d{1,5})\.?$/);
  if (number) return { site: 'leetcode', number: String(Number(number[1])) };

  const link = text.match(/^(?:https?:\/\/)?(?:www\.)?(leetcode\.com|leetcode\.cn|neetcode\.io)\/problems\/([a-z0-9-]+)/i);
  if (link) {
    const slug = link[2]!.toLowerCase();
    return link[1]!.toLowerCase() === 'neetcode.io' ? { site: 'neetcode', slug } : { site: 'leetcode', slug };
  }

  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(text)) return { site: 'leetcode', slug: text.toLowerCase() };
  return null;
}

/** Fetches a problem's details from the dashboard, outside the site's own pages. */
export async function lookUpProblem(ref: ProblemRef): Promise<Problem> {
  if (ref.site === 'neetcode') {
    return problemFromMeta(await fetchNeetcodeMeta(ref.slug, remoteJson('https://neetcode.io')));
  }
  const leetcode = remoteJson('https://leetcode.com');
  if ('number' in ref) {
    const slug = await findLeetcodeSlug(ref.number, leetcode);
    if (!slug) throw new Error(`LeetCode has no problem #${ref.number}.`);
    return fetchLeetcodeProblem(slug, leetcode);
  }
  return fetchLeetcodeProblem(ref.slug, leetcode);
}

/** "Two Sum (Variant)!" → "two-sum-variant", for problems added by hand. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'problem'
  );
}
