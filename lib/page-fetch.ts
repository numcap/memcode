/**
 * Same-origin JSON request from a content script, made as the page itself.
 *
 * Chrome's content-script fetch already behaves like the page's. In Firefox it can run
 * with the extension's principal instead, so it may go out without the page's
 * Origin/Referer and fail the site's CSRF checks; `content.fetch` is Firefox's way to
 * issue it from the page. The body is parsed here (not via res.json()) so the result belongs to the
 * content script rather than being a wrapper around a page object.
 */
export async function fetchPageJson(path: string, init: RequestInit): Promise<any> {
  const url = new URL(path, location.origin).href;
  const pageWindow = (globalThis as { content?: { fetch?: typeof fetch } }).content;
  const res = await (pageWindow?.fetch ? pageWindow.fetch(url, init) : fetch(url, init));
  if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`);
  return JSON.parse(await res.text());
}
