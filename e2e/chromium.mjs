// End-to-end smoke test in Chromium (Playwright). Loads the built extension, fakes the
// judge responses on leetcode.com / neetcode.io (problem metadata still comes from the
// real sites), and drives capture → library → review → export/import.
//
//   npm run build && node e2e/chromium.mjs
//
// Needs Playwright's Chromium once: npx playwright install chromium
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'e2e', 'shots');
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const EXT = path.join(ROOT, '.output/chrome-mv3');
const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'memcode-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extUrl = (p) => `chrome-extension://${new URL(sw.url()).host}/${p}`;

const FAKE_PAGE = (title) =>
  `<!doctype html><html><head><title>${title}</title></head><body style="background:#1a1a1a;color:#eee;font-family:sans-serif"><h1>${title} (mock page)</h1></body></html>`;

const PY_CODE = `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i`;

const logErrors = (page, label) => page.on('pageerror', (e) => console.log(`  [${label} error]`, e.message));

// ---------- LeetCode: accepted submission via fetch (submit) + XHR (check) ----------
{
  const page = await ctx.newPage();
  logErrors(page, 'leetcode');
  await page.route('https://leetcode.com/problems/two-sum/description/', (r) =>
    r.fulfill({ contentType: 'text/html', body: FAKE_PAGE('Two Sum - LeetCode') }),
  );
  await page.route('https://leetcode.com/problems/two-sum/submit/', (r) => r.fulfill({ json: { submission_id: 987654 } }));
  let polls = 0;
  await page.route('https://leetcode.com/submissions/detail/987654/check/', (r) =>
    r.fulfill({
      json:
        ++polls < 2
          ? { state: 'STARTED' }
          : {
              status_code: 10,
              lang: 'python3',
              status_runtime: '0 ms',
              status_memory: '18.1 MB',
              status_msg: 'Accepted',
              state: 'SUCCESS',
              total_correct: 63,
              total_testcases: 63,
            },
    }),
  );
  // GraphQL goes to the real LeetCode API (validates our query and the page-context fetch).
  await page.goto('https://leetcode.com/problems/two-sum/description/');
  await page.locator('.mc-fab').waitFor({ timeout: 15000 });
  check('LeetCode: floating button appears on problem page', true);

  await page.evaluate(async (code) => {
    await fetch('/problems/two-sum/submit/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'python3', question_id: '1', typed_code: code }),
    });
    const poll = () =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/submissions/detail/987654/check/');
        xhr.onload = () => resolve(JSON.parse(xhr.responseText));
        xhr.send();
      });
    let res;
    do res = await poll();
    while (res.state !== 'SUCCESS');
  }, PY_CODE);

  const modal = page.locator('.mc-modal');
  await modal.locator('.mc-modal-title').waitFor({ timeout: 15000 });
  const title = await modal.locator('.mc-modal-title').innerText();
  check('LeetCode: Accepted opens the rating modal', /Two Sum/.test(title), title);
  const eyebrow = await modal.locator('.mc-eyebrow').innerText();
  check('LeetCode: modal is labeled Accepted', /accepted/i.test(eyebrow), eyebrow);
  const pill = await modal.locator('.mc-pill').first().innerText();
  check('LeetCode: real GraphQL metadata loaded (difficulty)', pill === 'Easy', pill);
  const intervals = await modal.locator('.mc-rating-interval').allInnerTexts();
  check('LeetCode: interval previews shown', intervals.length === 4 && intervals.every((t) => t !== '—'), intervals.join(' / '));
  const summary = await modal.locator('.mc-code summary').innerText();
  check('LeetCode: captured code from submit request', /Python 3/.test(summary), summary);

  await modal.locator('textarea').first().fill('Hash map value→index; check complement before inserting. O(n).');
  await page.screenshot({ path: `${OUT}/1-leetcode-modal.png` });
  await modal.focus();
  await page.keyboard.press('3');
  const toast = page.locator('.mc-toast');
  await toast.waitFor({ timeout: 5000 });
  const toastText = (await toast.innerText()).replace(/\n/g, ' | ');
  check('LeetCode: rating with key "3" saves and shows toast', /Saved Two Sum/.test(toastText), toastText);

  await page.locator('.mc-toast button[aria-label="Dismiss"]').click();
  await page.evaluate(() => fetch('/submissions/detail/987654/check/'));
  await page.waitForTimeout(800);
  check('LeetCode: repeated check poll does not re-open modal', (await page.locator('.mc-modal').count()) === 0);
  const fabText = (await page.locator('.mc-fab').innerText()).replace(/\n/g, ' ');
  check('LeetCode: floating button reflects saved state', /In MemCode/.test(fabText), fabText);
  await page.close();
}

// ---------- LeetCode: wrong answer + run code don't prompt ----------
{
  const page = await ctx.newPage();
  await page.route('https://leetcode.com/problems/add-two-numbers/', (r) =>
    r.fulfill({ contentType: 'text/html', body: FAKE_PAGE('Add Two Numbers') }),
  );
  await page.route('https://leetcode.com/problems/add-two-numbers/submit/', (r) => r.fulfill({ json: { submission_id: 111 } }));
  await page.route('https://leetcode.com/problems/add-two-numbers/interpret_solution/', (r) =>
    r.fulfill({ json: { interpret_id: 'runcode_1_x' } }),
  );
  await page.route('https://leetcode.com/submissions/detail/**', (r) =>
    r.fulfill({
      json: { status_code: r.request().url().includes('runcode') ? 10 : 11, status_msg: 'Wrong Answer', state: 'SUCCESS' },
    }),
  );
  await page.goto('https://leetcode.com/problems/add-two-numbers/');
  await page.locator('.mc-fab').waitFor();
  await page.evaluate(async () => {
    await fetch('/problems/add-two-numbers/submit/', { method: 'POST', body: '{"lang":"cpp","typed_code":"x"}' });
    await fetch('/submissions/detail/111/check/');
    await fetch('/problems/add-two-numbers/interpret_solution/', { method: 'POST', body: '{}' });
    await fetch('/submissions/detail/runcode_1_x/check/');
  });
  await page.waitForTimeout(1000);
  check('LeetCode: wrong answer / run code do not prompt', (await page.locator('.mc-modal').count()) === 0);
  await page.close();
}

// ---------- NeetCode: accepted via XHR (Angular HttpClient style) ----------
{
  const page = await ctx.newPage();
  logErrors(page, 'neetcode');
  await page.route('https://neetcode.io/problems/two-integer-sum/question', (r) =>
    r.fulfill({ contentType: 'text/html', body: FAKE_PAGE('NeetCode') }),
  );
  await page.route('https://neetcode.io/api/executeCodeFunctionHttp', (r) =>
    r.fulfill({ json: { data: { status: { id: 3, description: 'Accepted' }, time: '0.041', memory: 13300 } } }),
  );
  // Metadata comes from the real NeetCode API.
  await page.goto('https://neetcode.io/problems/two-integer-sum/question');
  await page.locator('.mc-fab').waitFor({ timeout: 15000 });
  await page.evaluate(() => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/executeCodeFunctionHttp');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ data: { problemId: 'two-integer-sum', rawCode: 'class Solution:\n    pass', lang: 'python' } }));
  });
  const modal = page.locator('.mc-modal');
  await modal.locator('.mc-modal-title').waitFor({ timeout: 15000 });
  const title = await modal.locator('.mc-modal-title').innerText();
  check('NeetCode: Accepted opens modal with real metadata', /Two Sum/.test(title), title);
  const summary = await modal.locator('.mc-code summary').innerText();
  check('NeetCode: captured code + runtime', /Python · 41 ms/.test(summary), summary);
  await page.screenshot({ path: `${OUT}/2-neetcode-modal.png` });
  await modal.locator('.mc-rating-4').click();
  await page.locator('.mc-toast').waitFor();
  check('NeetCode: clicking Easy saves', true);

  // Manual save with code read from NeetCode's editor localStorage.
  await page.locator('.mc-toast button[aria-label="Dismiss"]').click();
  await page.evaluate(() => {
    localStorage.setItem('saved-coding-language', 'java');
    localStorage.setItem('two-integer-sum_java_tabs', JSON.stringify([{ code: 'class Solution { /* java draft */ }' }]));
  });
  await page.locator('.mc-fab').click();
  await modal.locator('.mc-modal-title').waitFor();
  const codeValue = await modal.locator('.mc-textarea-code').inputValue();
  check('NeetCode: manual button reads editor code from localStorage', /java draft/.test(codeValue), codeValue);
  const meta = (await modal.locator('.mc-modal-meta').innerText()).replace(/\n/g, ' ');
  check('NeetCode: manual modal knows card already exists', /In your deck/.test(meta), meta);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('NeetCode: Escape closes the modal', (await modal.count()) === 0);
  await page.close();
}

// ---------- SPA navigation: content script loaded on a non-problem page ----------
{
  const page = await ctx.newPage();
  await page.route('https://leetcode.com/problemset/', (r) => r.fulfill({ contentType: 'text/html', body: FAKE_PAGE('Problemset') }));
  await page.goto('https://leetcode.com/problemset/');
  await page.waitForTimeout(1500);
  const before = await page.locator('.mc-fab').count();
  await page.evaluate(() => history.pushState({}, '', '/problems/two-sum/description/'));
  await page.locator('.mc-fab').waitFor({ timeout: 5000 });
  check('SPA: button hidden off-problem, appears after client-side navigation', before === 0);
  await page.close();
}

// ---------- Dashboard, review, badge, export/import, popup ----------
{
  const page = await ctx.newPage();
  logErrors(page, 'dashboard');
  const ext = () => page.evaluate(() => (globalThis.browser ?? globalThis.chrome) !== undefined);

  await page.goto(extUrl('dashboard.html#/library'));
  await page.locator('.card-table tbody tr').first().waitFor();
  check('Dashboard: extension APIs available', await ext());
  check('Dashboard: no site-access banner (permissions granted)', (await page.locator('.site-access').count()) === 0);
  const rows = await page.locator('.card-table tbody tr').count();
  check('Dashboard: library lists both saved problems', rows === 2, `${rows} rows`);
  const seen = await page.locator('.card-table tbody tr').first().locator('td').nth(3).innerText();
  check('Dashboard: shows days since seen', seen === 'today', seen);
  await page.screenshot({ path: `${OUT}/3-library.png`, fullPage: true });

  await page.goto(extUrl(`dashboard.html#/card/${encodeURIComponent('leetcode:two-sum')}`));
  await page.locator('.card-detail h1').waitFor();
  const notes = await page.locator('.notes-editor textarea').inputValue();
  check('Dashboard: card detail shows saved notes', /complement/.test(notes), notes);
  check('Dashboard: code is syntax highlighted', (await page.locator('.code-block .hljs').count()) === 1);
  await page.screenshot({ path: `${OUT}/4-card-detail.png`, fullPage: true });

  await page.goto(extUrl(`dashboard.html#/review?card=${encodeURIComponent('leetcode:two-sum')}`));
  await page.locator('.review-card h1').waitFor();
  check('Review: topics hidden on the front', (await page.locator('.review-header .link-button').count()) === 1);
  await page.keyboard.press('Space');
  await page.locator('.answer').waitFor();
  await page.waitForTimeout(900);
  const scrolled = await page.evaluate(() => window.scrollY);
  check('Review: Space reveals and scrolls to the answer', scrolled > 200, `scrollY=${scrolled}`);
  await page.screenshot({ path: `${OUT}/5-review-back.png` });
  await page.keyboard.press('2');
  await page.locator('.empty-state h1').waitFor();
  const done = (await page.locator('.empty-state').innerText()).replace(/\n+/g, ' | ');
  check('Review: rating with "2" finishes the session', /Session complete/.test(done) && /Hard\s*\|?\s*1/.test(done), done);

  const log = await page.evaluate(async () => {
    const api = globalThis.browser ?? globalThis.chrome;
    const got = await api.storage.local.get('card:leetcode:two-sum');
    return got['card:leetcode:two-sum'].reviewLog;
  });
  check('Review: review recorded in storage', log.length === 2 && log[1].kind === 'review' && log[1].rating === 2, JSON.stringify(log));

  // Make a card overdue → badge and review queue pick it up.
  await page.evaluate(async () => {
    const api = globalThis.browser ?? globalThis.chrome;
    const key = 'card:neetcode:two-integer-sum';
    const card = (await api.storage.local.get(key))[key];
    card.srs.due = Date.now() - 3 * 86400000;
    await api.storage.local.set({ [key]: card });
  });
  await page.waitForTimeout(800);
  const badge = await page.evaluate(() => (globalThis.browser ?? globalThis.chrome).action.getBadgeText({}));
  check('Badge: shows due count after a card becomes due', badge === '1', JSON.stringify(badge));
  await page.goto(extUrl('dashboard.html#/review'));
  await page.reload();
  await page.locator('.review-card h1').waitFor();
  check('Review: due queue contains the overdue card', /Two Sum/.test(await page.locator('.review-card h1').innerText()));

  // Export, delete, import.
  const exported = await page.evaluate(async () => {
    const api = globalThis.browser ?? globalThis.chrome;
    const all = await api.storage.local.get(null);
    return {
      app: 'memcode',
      version: 1,
      exportedAt: Date.now(),
      settings: all.settings,
      cards: Object.entries(all)
        .filter(([k]) => k.startsWith('card:'))
        .map(([, v]) => v),
    };
  });
  await page.evaluate(() => (globalThis.browser ?? globalThis.chrome).storage.local.remove('card:leetcode:two-sum'));
  await page.goto(extUrl('dashboard.html#/settings'));
  await page.locator('.settings h1').waitFor();
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await page.locator('.success').waitFor();
  const importMsg = await page.locator('.success').innerText();
  check('Settings: import restores a deleted card', /1 added/.test(importMsg), importMsg);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(extUrl('dashboard.html#/library'));
  await page.locator('.card-table').waitFor();
  await page.screenshot({ path: `${OUT}/6-library-mobile-dark.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('Dashboard: no horizontal scroll at 360px', !overflow);

  await page.setViewportSize({ width: 340, height: 520 });
  await page.goto(extUrl('popup.html'));
  await page.locator('.due-number').waitFor();
  const due = await page.locator('.due-number').innerText();
  check('Popup: shows due count', due === '1', due);
  await page.screenshot({ path: `${OUT}/7-popup-dark.png` });
  await page.close();
}

await ctx.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nchromium: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
