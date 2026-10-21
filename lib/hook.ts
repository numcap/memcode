import type { CaptureSite } from './types';

/**
 * The page-world hook and the isolated content scripts talk over window.postMessage.
 * The page can forge these messages, so receivers only ever use them to open the
 * rating modal — nothing is saved without the user clicking a rating.
 */
export const HOOK_SOURCE = 'remcode-hook';

export interface NeetcodeMeta {
  id: string;
  name: string;
  difficulty?: string;
  topics?: string[];
  description?: string;
  /** Latest accepted submission from the user's history, present when logged in. */
  latestAccepted?: { code: string; lang: string; at: number };
}

export interface AcceptedEvent {
  type: 'accepted';
  site: CaptureSite;
  slug: string;
  code?: string;
  lang?: string;
  runtime?: string;
  memory?: string;
  submissionId?: string;
}

export type HookEvent = AcceptedEvent | { type: 'neetcode-meta'; meta: NeetcodeMeta };

export interface HookMessage {
  source: typeof HOOK_SOURCE;
  event: HookEvent;
}

export function isHookMessage(data: unknown): data is HookMessage {
  const msg = data as HookMessage;
  return msg?.source === HOOK_SOURCE && typeof msg.event?.type === 'string';
}

export interface Exchange {
  url: string;
  method: string;
  requestBody?: string;
  responseText: string;
  /** location.href of the page that made the request. */
  pageUrl: string;
}

const LC_SUBMIT = /^\/problems\/([^/]+)\/submit\/?$/;
// The Submit button polls /v2/check/; the older /check/ is still used by other flows.
const LC_CHECK = /^\/submissions\/detail\/(\d+)\/(?:v2\/)?check\/?$/;
const NC_EXECUTE = /^\/api\/executeCodeFunctionHttp\/?$/;
const NC_METADATA = /^\/api\/getProblemMetadataFunctionHttp\/?$/;

/** Stateful classifier for the requests the hook sees. Kept DOM-free so it can be unit tested. */
export class TrafficInspector {
  private pending = new Map<string, { slug: string; lang?: string; code?: string }>();
  private reported = new Set<string>();

  /** Cheap pre-filter so the hook only reads bodies of requests we care about. */
  wants(url: string, method: string, pageUrl: string): boolean {
    const target = parse(url, pageUrl);
    if (!target) return false;
    const post = method.toUpperCase() === 'POST';
    if (target.host === 'leetcode.com') {
      return (post && LC_SUBMIT.test(target.path)) || LC_CHECK.test(target.path);
    }
    if (target.host === 'neetcode.io') {
      return post && (NC_EXECUTE.test(target.path) || NC_METADATA.test(target.path));
    }
    return false;
  }

  inspect(x: Exchange): HookEvent | null {
    const target = parse(x.url, x.pageUrl);
    if (!target) return null;
    const res = parseJson(x.responseText);
    if (!res) return null;

    if (target.host === 'leetcode.com') {
      const submitSlug = target.path.match(LC_SUBMIT)?.[1];
      if (submitSlug) {
        const req = parseJson(x.requestBody);
        if (res.submission_id != null) {
          this.pending.set(String(res.submission_id), {
            slug: submitSlug,
            lang: str(req?.lang),
            code: str(req?.typed_code),
          });
        }
        return null;
      }
      const id = target.path.match(LC_CHECK)?.[1];
      if (id && isLeetcodeAccepted(res)) {
        if (this.reported.has(id)) return null;
        this.reported.add(id);
        const sub = this.pending.get(id);
        const slug = sub?.slug ?? problemSlugFromPath(new URL(x.pageUrl).pathname);
        if (!slug) return null;
        return {
          type: 'accepted',
          site: 'leetcode',
          slug,
          code: sub?.code,
          lang: sub?.lang ?? str(res.lang),
          runtime: str(res.status_runtime),
          memory: str(res.status_memory),
          submissionId: id,
        };
      }
      return null;
    }

    if (target.host === 'neetcode.io') {
      const data = res.data ?? res.result;
      if (NC_EXECUTE.test(target.path)) {
        const req = parseJson(x.requestBody)?.data;
        if (!req?.problemId || !isNeetcodeAccepted(data)) return null;
        return {
          type: 'accepted',
          site: 'neetcode',
          slug: String(req.problemId),
          code: str(req.rawCode),
          lang: str(req.lang),
          runtime: neetcodeRuntime(data.time),
        };
      }
      if (NC_METADATA.test(target.path) && typeof data?.id === 'string') {
        return { type: 'neetcode-meta', meta: toNeetcodeMeta(data) };
      }
    }
    return null;
  }
}

/** Mirrors how LeetCode's own client reads a check response. */
export function isLeetcodeAccepted(res: any): boolean {
  if (res?.state !== 'SUCCESS' || res.status_code !== 10) return false;
  // LeetCode downgrades "Accepted" to Wrong Answer if any test case failed.
  if (typeof res.compare_result === 'string' && res.compare_result.includes('0')) return false;
  // v2 responses can carry an AI judge (e.g. for problem restrictions) that is still
  // running after `state` is SUCCESS; the verdict isn't final until it finishes.
  return res.ai_state == null || res.ai_state === 'SUCCESS';
}

export function isNeetcodeAccepted(data: any): boolean {
  return data?.status?.description === 'Accepted';
}

export function toNeetcodeMeta(data: any): NeetcodeMeta {
  const history: any[] = Array.isArray(data.submissionHistory) ? data.submissionHistory : [];
  const accepted = history
    .filter((s) => s?.statusDescription === 'Accepted' && typeof s.code === 'string')
    .map((s) => ({ code: s.code as string, lang: String(s.language ?? ''), at: Date.parse(s.date) || 0 }))
    .sort((a, b) => b.at - a.at)[0];
  return {
    id: data.id,
    name: str(data.name) ?? data.id,
    difficulty: str(data.difficulty),
    topics: Array.isArray(data.topics) ? data.topics.filter((t: unknown) => typeof t === 'string') : undefined,
    description: str(data.description),
    latestAccepted: accepted,
  };
}

function neetcodeRuntime(time: unknown): string | undefined {
  const seconds = parseFloat(String(time));
  return Number.isFinite(seconds) ? `${Math.round(seconds * 1000)} ms` : undefined;
}

/** Both sites use /problems/<slug>/... for problem pages. */
export function problemSlugFromPath(pathname: string): string | null {
  return pathname.match(/^\/problems\/([^/]+)/)?.[1] ?? null;
}

function parse(url: string, base: string): { host: string; path: string } | null {
  try {
    const u = new URL(url, base);
    return { host: u.hostname.replace(/^www\./, ''), path: u.pathname };
  } catch {
    return null;
  }
}

function parseJson(text: string | undefined): any {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
