import { defineContentScript } from 'wxt/utils/define-content-script';
import { HOOK_SOURCE, TrafficInspector, type HookEvent, type HookMessage } from '@/lib/hook';

/**
 * Runs in the page's own JS world before the site's scripts so it can observe the
 * site's submit/judge traffic. It never changes requests or responses, only reads copies.
 */
export default defineContentScript({
  matches: ['https://leetcode.com/*', 'https://neetcode.io/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // Firefox re-runs this in already-open tabs when the add-on reloads, but the page's
    // JS world (and our earlier wrapper) survives. The existing wrapper keeps working, so
    // don't wrap fetch/XHR a second time.
    const installed = Symbol.for('remcode.pageHook');
    const pageWindow = window as unknown as Record<symbol, boolean>;
    if (pageWindow[installed]) return;
    pageWindow[installed] = true;

    const inspector = new TrafficInspector();

    const report = (url: string, method: string, requestBody: string | undefined, responseText: string) => {
      let event: HookEvent | null = null;
      try {
        event = inspector.inspect({ url, method, requestBody, responseText, pageUrl: location.href });
      } catch {
        return;
      }
      if (!event) return;
      const message: HookMessage = { source: HOOK_SOURCE, event };
      window.postMessage(message, location.origin);
    };

    const originalFetch = window.fetch;
    window.fetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      let watched: { url: string; method: string; body: Promise<string | undefined> } | undefined;
      try {
        const request = input instanceof Request ? input : undefined;
        const url = request ? request.url : String(input);
        const method = init?.method ?? request?.method ?? 'GET';
        if (inspector.wants(url, method, location.href)) {
          // Read the request body before fetch consumes it.
          const body =
            typeof init?.body === 'string'
              ? Promise.resolve(init.body)
              : request && !init?.body
                ? request.clone().text().catch(() => undefined)
                : Promise.resolve(undefined);
          watched = { url, method, body };
        }
      } catch {
        watched = undefined;
      }

      const response = await originalFetch.call(this, input, init);
      if (watched) {
        const { url, method, body } = watched;
        Promise.all([body, response.clone().text()])
          .then(([requestBody, text]) => report(url, method, requestBody, text))
          .catch(() => {});
      }
      return response;
    };

    const xhrInfo = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      xhrInfo.set(this, { method, url: String(url) });
      return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const info = xhrInfo.get(this);
      if (info && inspector.wants(info.url, info.method, location.href)) {
        const requestBody = typeof body === 'string' ? body : undefined;
        this.addEventListener('load', () => {
          try {
            const text =
              this.responseType === '' || this.responseType === 'text'
                ? this.responseText
                : this.responseType === 'json'
                  ? JSON.stringify(this.response)
                  : undefined;
            if (text) report(info.url, info.method, requestBody, text);
          } catch {
            // Never let our observer break the site.
          }
        });
      }
      return originalSend.call(this, body);
    };
  },
});
