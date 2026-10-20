import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { isHookMessage, type AcceptedEvent, type HookEvent } from '@/lib/hook';
import { CaptureApp, type SiteAdapter } from './CaptureApp';
import './theme.css';
import './ui.css';
import './capture.css';

/**
 * Wires a site adapter to the page hook and mounts the capture UI. Call at
 * document_start so hook messages sent during page load (e.g. NeetCode's
 * metadata response) aren't missed before the UI exists.
 */
export function startCapture(ctx: ContentScriptContext, adapter: SiteAdapter): void {
  const acceptedListeners = new Set<(event: AcceptedEvent) => void>();

  ctx.addEventListener(window, 'message', (e: MessageEvent) => {
    // The hook posts from the page's own window; ignore frames and other origins.
    if (e.source !== window || e.origin !== location.origin || !isHookMessage(e.data)) return;
    // In Firefox, objects posted by the page arrive as wrappers around page objects;
    // copy so we only ever hold (and later store) plain data of our own.
    const event: HookEvent = JSON.parse(JSON.stringify(e.data.event));
    adapter.onHookEvent?.(event);
    if (event.type === 'accepted' && event.site === adapter.site) {
      acceptedListeners.forEach((listener) => listener(event));
    }
  });

  const subscribeAccepted = (listener: (event: AcceptedEvent) => void) => {
    acceptedListeners.add(listener);
    return () => {
      acceptedListeners.delete(listener);
    };
  };
  // The event fires from the Navigation API before `location` updates, so pass its newUrl along.
  const onLocationChange = (callback: (url: URL) => void) =>
    ctx.addEventListener(window, 'wxt:locationchange', (e) => callback(e.newUrl));

  const mount = async () => {
    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'memcode-capture',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      // Keep keystrokes in our textareas from triggering the site's shortcuts.
      isolateEvents: true,
      onMount(container) {
        const root = createRoot(container);
        root.render(
          <CaptureApp adapter={adapter} onLocationChange={onLocationChange} subscribeAccepted={subscribeAccepted} />,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
    // SPAs occasionally wipe body children; re-attach the same host so React state survives.
    ctx.setInterval(() => {
      if (!ui.shadowHost.isConnected && document.body) document.body.append(ui.shadowHost);
    }, 2000);
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
}
