import { getSettings, onSettingsChanged } from '@/lib/storage';
import type { ThemeChoice } from '@/lib/types';

// Settings load asynchronously; this copy lets the page paint in the right theme at once.
const CACHE_KEY = 'remcode-theme';

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    localStorage.setItem(CACHE_KEY, choice);
  } catch {
    // Storage blocked; the next load just starts from the OS theme.
  }
}

/** Applies the Light / Dark / System setting to an extension page and keeps it in sync. */
export function initPageTheme() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached === 'light' || cached === 'dark') document.documentElement.dataset.theme = cached;
  } catch {
    // Fall through to the stored setting.
  }
  getSettings().then((s) => apply(s.theme));
  onSettingsChanged((s) => apply(s.theme));
}
