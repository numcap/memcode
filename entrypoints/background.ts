import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { getReviewQueue, isDeckChange } from '@/lib/storage';
import { syncNow } from '@/lib/sync';

const BADGE_ALARM = 'remcode-badge';
const SYNC_ALARM = 'remcode-sync';
const SYNC_SOON_ALARM = 'remcode-sync-soon';

export default defineBackground(() => {
  const updateBadge = async () => {
    const due = (await getReviewQueue()).length;
    await browser.action.setBadgeText({ text: due ? String(due) : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#5b5bd6' });
  };

  const onLaunch = () => {
    updateBadge();
    syncNow();
  };
  browser.runtime.onInstalled.addListener(() => {
    // Alarms outlive updates; this one is from before the rename to ReMCode.
    browser.alarms.clear('memcode-badge');
    onLaunch();
  });
  browser.runtime.onStartup.addListener(onLaunch);
  // Cards become due as time passes, not only when storage changes.
  browser.alarms.create(BADGE_ALARM, { periodInMinutes: 15 });
  // Picks up reviews done in other browsers. syncNow is a no-op until GitHub is connected.
  // Only if missing: the background restarts often, and re-creating would keep postponing it.
  browser.alarms.get(SYNC_ALARM).then((alarm) => {
    if (!alarm) browser.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BADGE_ALARM) updateBadge();
    if (alarm.name === SYNC_ALARM || alarm.name === SYNC_SOON_ALARM) syncNow();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    updateBadge();
    // Re-creating the alarm restarts it, so a burst of edits becomes one sync. Unlike
    // setTimeout, an alarm still fires if the MV3 background is stopped meanwhile.
    if (isDeckChange(changes)) browser.alarms.create(SYNC_SOON_ALARM, { delayInMinutes: 0.5 });
  });

  // Content scripts can't open extension pages themselves.
  browser.runtime.onMessage.addListener((message: { type?: string; hash?: string }) => {
    if (message?.type === 'sync-now') return syncNow();
    if (message?.type !== 'open-dashboard') return;
    const hash = typeof message.hash === 'string' && message.hash.startsWith('#/') ? message.hash : '';
    browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') + hash });
  });

  updateBadge();
});
