import { browser } from 'wxt/browser';
import { SITE_MATCHES } from './sites';

// Chrome grants these at install. Firefox lets users withhold or revoke them per site,
// in which case the content scripts silently never run.
export async function hasSiteAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: SITE_MATCHES });
}

/** Must be called directly from a click handler (no await before it). */
export function requestSiteAccess(): Promise<boolean> {
  return browser.permissions.request({ origins: SITE_MATCHES });
}
