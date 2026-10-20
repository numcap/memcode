import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { getReviewQueue } from '@/lib/storage';

const BADGE_ALARM = 'memcode-badge';

export default defineBackground(() => {
  const updateBadge = async () => {
    const due = (await getReviewQueue()).length;
    await browser.action.setBadgeText({ text: due ? String(due) : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#5b5bd6' });
  };

  browser.runtime.onInstalled.addListener(updateBadge);
  browser.runtime.onStartup.addListener(updateBadge);
  // Cards become due as time passes, not only when storage changes.
  browser.alarms.create(BADGE_ALARM, { periodInMinutes: 15 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BADGE_ALARM) updateBadge();
  });
  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') updateBadge();
  });

  // Content scripts can't open extension pages themselves.
  browser.runtime.onMessage.addListener((message: { type?: string; hash?: string }) => {
    if (message?.type !== 'open-dashboard') return;
    const hash = typeof message.hash === 'string' && message.hash.startsWith('#/') ? message.hash : '';
    browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') + hash });
  });

  updateBadge();
});
