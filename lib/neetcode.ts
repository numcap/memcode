import { marked } from 'marked';
import { toNeetcodeMeta, type NeetcodeMeta } from './hook';
import { toDifficulty } from './leetcode';
import { fetchPageJson, type JsonFetcher } from './page-fetch';
import type { Problem, Submission } from './types';

const NEETCODE_LANGS = [
  'python',
  'java',
  'cpp',
  'javascript',
  'typescript',
  'csharp',
  'go',
  'kotlin',
  'swift',
  'rust',
  'sql',
];

/** The same endpoint NeetCode's own page calls; it works without auth for problem content. */
export async function fetchNeetcodeMeta(slug: string, fetchJson: JsonFetcher = fetchPageJson): Promise<NeetcodeMeta> {
  const json = await fetchJson('/api/getProblemMetadataFunctionHttp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { problemId: slug } }),
  });
  const data = json.data ?? json.result;
  if (typeof data?.id !== 'string') throw new Error(`NeetCode has no problem "${slug}"`);
  return toNeetcodeMeta(data);
}

export function problemFromMeta(meta: NeetcodeMeta): Problem {
  return {
    source: 'neetcode',
    slug: meta.id,
    title: meta.name,
    url: `https://neetcode.io/problems/${meta.id}/question`,
    difficulty: toDifficulty(meta.difficulty),
    tags: meta.topics ?? [],
    // NeetCode descriptions are Markdown with some inline HTML (hint <details>).
    descriptionHtml: meta.description ? (marked.parse(meta.description, { async: false }) as string) : '',
  };
}

/**
 * Reads the code NeetCode keeps in localStorage for its editor:
 * `<slug>_<lang>_tabs` = JSON [{code}], `<slug>_<lang>_activeTab` = index,
 * with a legacy fallback of `<slug>_<lang>` = raw code.
 */
export function readEditorCode(storage: Storage, slug: string): Submission | undefined {
  const preferred = readPreferredLang(storage);
  const langs = preferred ? [preferred, ...NEETCODE_LANGS.filter((l) => l !== preferred)] : NEETCODE_LANGS;
  for (const lang of langs) {
    const code = readTabs(storage, slug, lang) ?? storage.getItem(`${slug}_${lang}`);
    if (code?.trim()) return { code, lang, at: Date.now() };
  }
  return undefined;
}

function readTabs(storage: Storage, slug: string, lang: string): string | undefined {
  const raw = storage.getItem(`${slug}_${lang}_tabs`);
  if (!raw) return undefined;
  try {
    const tabs = JSON.parse(raw) as { code?: string }[];
    if (!Array.isArray(tabs) || !tabs.length) return undefined;
    const active = parseInt(storage.getItem(`${slug}_${lang}_activeTab`) ?? '0', 10) || 0;
    return (tabs[active] ?? tabs[0])?.code;
  } catch {
    return undefined;
  }
}

function readPreferredLang(storage: Storage): string | undefined {
  const raw = storage.getItem('saved-coding-language');
  if (!raw) return undefined;
  const lang = raw.replace(/^"|"$/g, '');
  return NEETCODE_LANGS.includes(lang) ? lang : undefined;
}
