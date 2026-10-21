import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { hasSiteAccess, requestSiteAccess } from '@/lib/permissions';

/** Shown only when the browser hasn't granted access to LeetCode/NeetCode (Firefox). */
export function SiteAccessBanner() {
  const [granted, setGranted] = useState(true);

  useEffect(() => {
    const check = () => hasSiteAccess().then(setGranted);
    check();
    browser.permissions.onAdded.addListener(check);
    browser.permissions.onRemoved.addListener(check);
    return () => {
      browser.permissions.onAdded.removeListener(check);
      browser.permissions.onRemoved.removeListener(check);
    };
  }, []);

  if (granted) return null;
  return (
    <div className="site-access" role="alert">
      <span>ReMCode needs access to LeetCode and NeetCode to notice accepted submissions.</span>
      <button type="button" className="mc-btn mc-btn-primary" onClick={() => requestSiteAccess().then(setGranted)}>
        Allow access
      </button>
    </div>
  );
}
