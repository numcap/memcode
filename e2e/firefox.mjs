// End-to-end smoke test in real Firefox over WebDriver BiDi (puppeteer-core).
// Fakes the judge responses on leetcode.com / neetcode.io (problem metadata still comes
// from the real sites), then drives the extension's own pages.
//
//   npm run build:firefox && node e2e/firefox.mjs
//
// Uses the installed Firefox; override with FIREFOX_BIN=/path/to/firefox.
//
// Firefox only lets WebDriver into moz-extension:// pages with -remote-allow-system-access,
// and even then refuses to navigate to them directly or send real input/screenshots there.
// So MemCode opens its own dashboard tab (toast → Open), navigation inside it is by
// location.hash, and keys are dispatched as DOM events. Real key handling is covered by
// the Chromium smoke test.
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIREFOX_BIN = process.env.FIREFOX_BIN ?? '/Applications/Firefox.app/Contents/MacOS/firefox';
const UUID = '6d0c1c2e-5a43-4c4e-9a52-6d656d636f64';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: FIREFOX_BIN,
  headless: true,
  // -new-instance/-no-remote: don't hand off to an already-running Firefox.
  args: ['-new-instance', '-no-remote', '-remote-allow-system-access'],
  env: { ...process.env, MOZ_NO_REMOTE: '1' },
  userDataDir: mkdtempSync(path.join(tmpdir(), 'memcode-ff-')),
  extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ 'memcode@memcode': UUID }) },
});

try {
  console.log(`Testing in ${await browser.version()}`);
  await browser.installExtension(path.join(ROOT, '.output/firefox-mv3'));

  const MOCK_PAGE = '<!doctype html><html><body><h1>mock problem page</h1></body></html>';
  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  /** New tab whose requests matching `routes` (url suffix → response) are faked. */
  const mockedPage = async (routes) => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('  [page error]', e.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const hit = Object.entries(routes).find(([suffix]) => req.url().endsWith(suffix));
      if (hit) req.respond(typeof hit[1] === 'function' ? hit[1](req) : hit[1]);
      else req.continue();
    });
    return page;
  };

  // ---- LeetCode: wrong answer doesn't prompt ----
  {
    const page = await mockedPage({
      '/problems/add-two-numbers/': { status: 200, contentType: 'text/html', body: MOCK_PAGE },
      '/problems/add-two-numbers/submit/': json({ submission_id: 111 }),
      '/submissions/detail/111/check/': json({ state: 'SUCCESS', status_code: 11, status_msg: 'Wrong Answer' }),
    });
    await page.goto('https://leetcode.com/problems/add-two-numbers/');
    await page.waitForSelector('pierce/.mc-fab', { timeout: 15000 });
    await page.evaluate(async () => {
      await fetch('/problems/add-two-numbers/submit/', { method: 'POST', body: '{"lang":"cpp","typed_code":"x"}' });
      await fetch('/submissions/detail/111/check/');
    });
    await sleep(1000);
    check('LeetCode: wrong answer does not prompt', (await page.$('pierce/.mc-modal')) === null);
    await page.close();
  }

  // ---- NeetCode: accepted via XHR, real metadata API ----
  {
    const page = await mockedPage({
      '/problems/two-integer-sum/question': { status: 200, contentType: 'text/html', body: MOCK_PAGE },
      '/api/executeCodeFunctionHttp': json({ data: { status: { description: 'Accepted' }, time: '0.041' } }),
    });
    await page.goto('https://neetcode.io/problems/two-integer-sum/question');
    await page.waitForSelector('pierce/.mc-fab', { timeout: 15000 });
    await page.evaluate(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/executeCodeFunctionHttp');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ data: { problemId: 'two-integer-sum', rawCode: 'class Solution: pass', lang: 'python' } }));
    });
    await page.waitForSelector('pierce/.mc-modal-title', { timeout: 15000 });
    const summary = await page.$eval('pierce/.mc-code summary', (el) => el.textContent);
    check('NeetCode: Accepted opens modal with captured code', /Python · 41 ms/.test(summary), summary);
    await (await page.$('pierce/.mc-rating-4')).click();
    await page.waitForSelector('pierce/.mc-toast', { timeout: 5000 });
    check('NeetCode: rating saves', true);
    await page.close();
  }

  // ---- LeetCode: accepted (fetch submit + check), real GraphQL, then open the dashboard ----
  let dash;
  {
    const page = await mockedPage({
      '/problems/two-sum/description/': { status: 200, contentType: 'text/html', body: MOCK_PAGE },
      '/problems/two-sum/submit/': json({ submission_id: 555 }),
      '/submissions/detail/555/v2/check/': json({
        state: 'SUCCESS',
        ai_state: 'SUCCESS',
        status_code: 10,
        status_runtime: '1 ms',
        status_memory: '17 MB',
        lang: 'python3',
      }),
    });
    await page.goto('https://leetcode.com/problems/two-sum/description/');
    await page.waitForSelector('pierce/.mc-fab', { timeout: 15000 });
    check('LeetCode: floating button injected', true);
    await page.evaluate(async () => {
      await fetch('/problems/two-sum/submit/', {
        method: 'POST',
        body: JSON.stringify({ lang: 'python3', typed_code: 'class Solution:\n    pass' }),
      });
      await fetch('/submissions/detail/555/v2/check/');
    });
    await page.waitForSelector('pierce/.mc-modal-title', { timeout: 15000 });
    const title = await page.$eval('pierce/.mc-modal-title', (el) => el.textContent);
    const pill = await page.$eval('pierce/.mc-modal .mc-pill', (el) => el.textContent);
    check('LeetCode: Accepted → modal with real GraphQL metadata', /Two Sum/.test(title) && pill === 'Easy', `${title} / ${pill}`);
    await (await page.$('pierce/.mc-rating-3')).click();
    await page.waitForSelector('pierce/.mc-toast', { timeout: 5000 });
    check('LeetCode: rating saves', true);

    const before = (await browser.pages()).length;
    await (await page.$('pierce/.mc-toast .mc-btn')).click();
    for (let i = 0; i < 50 && (await browser.pages()).length === before; i++) await sleep(200);
    dash = (await browser.pages()).at(-1);
    await sleep(1500);
    const href = await dash.evaluate(() => location.href);
    check('Toast "Open" opens the card in the dashboard', /^moz-extension:.*#\/card\//.test(href), href);
  }

  // ---- Extension pages ----
  const page = dash;
  page.on('pageerror', (e) => console.log('  [dashboard error]', e.message));
  const go = async (hash, selector) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForSelector(selector, { timeout: 10000 });
  };
  const press = (key) =>
    page.evaluate((k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), key);

  await page.waitForSelector('.card-detail h1', { timeout: 10000 });
  check('Card detail renders highlighted code', (await page.$('.code-block .hljs')) !== null);
  await go('#/library', '.card-table tbody tr');
  check('No site-access banner (host permissions granted)', (await page.$('.site-access')) === null);
  const rows = await page.$$eval('.card-table tbody tr', (r) => r.length);
  check('Library lists both saved problems', rows === 2, `${rows} rows`);

  await page.evaluate(async () => {
    const key = 'card:leetcode:two-sum';
    const card = (await browser.storage.local.get(key))[key];
    card.srs.due = Date.now() - 2 * 86400000;
    await browser.storage.local.set({ [key]: card });
  });
  await sleep(800);
  check('Badge set by background event page', (await page.evaluate(() => browser.action.getBadgeText({}))) === '1');

  await go('#/review', '.review-card h1');
  await press(' ');
  await page.waitForSelector('.answer', { timeout: 5000 });
  check('Review: Space reveals the answer', true);
  await press('3');
  await page.waitForSelector('.empty-state h1', { timeout: 5000 });
  check('Review: session completes', /Session complete/.test(await page.$eval('.empty-state', (el) => el.innerText)));
  const log = await page.evaluate(
    async () => (await browser.storage.local.get('card:leetcode:two-sum'))['card:leetcode:two-sum'].reviewLog,
  );
  check('Review: recorded in storage', log.at(-1)?.kind === 'review' && log.at(-1)?.rating === 3);
  check('Badge clears after review', (await page.evaluate(() => browser.action.getBadgeText({}))) === '');

  await go('#/settings', '.settings h1');
  check('Settings page renders', true);
  await page.evaluate(() => (location.href = '/popup.html'));
  await page.waitForSelector('.due-number', { timeout: 10000 });
  check('Popup renders', true, await page.$eval('.due-sub', (el) => el.textContent));
} finally {
  await browser.close();
}

const passed = results.filter(Boolean).length;
console.log(`\nfirefox: ${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
