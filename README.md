# MemCode

A browser extension for Chrome and Firefox that does spaced repetition on the LeetCode and NeetCode problems you've solved. When a submission is accepted, MemCode asks how hard it was (Again / Hard / Good / Easy, like Anki). It saves the problem, your code, and a short "key insight" note, then schedules reviews with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs). Reviews are active recall: you look at the problem, recall the pattern and code, then reveal your notes and solution. You don't solve problems inside the extension.

Everything is stored locally in the browser's extension storage. There is no account and no server. To share one deck between browsers, turn on **GitHub sync** (below), or move it by hand with **Settings → Export / Import**.

For a guided tour of how it all works (extension contexts, the network hook, Shadow DOM, FSRS, cross-browser quirks, testing), read [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).

## Build

Requires Node 22 or newer (`nvm use` reads `.nvmrc`).

```sh
npm install
npm run build           # Chrome  → .output/chrome-mv3
npm run build:firefox   # Firefox → .output/firefox-mv3
```

## Install in Chrome

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.

For development, run `npm run dev` and load `.output/chrome-mv3-dev` instead. It rebuilds on save.

## Install in Firefox (140+)

**To try it out:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and pick `.output/firefox-mv3/manifest.json`. Firefox removes temporary add-ons when it restarts, and **their stored data goes with them**, so don't keep a real deck in a temporary install.

**For daily use,** install a signed copy:

1. Create free API credentials at [addons.mozilla.org → Developer Hub → API keys](https://addons.mozilla.org/developers/addon/api/key/).
2. Sign an unlisted build. It is reviewed automatically and is not published on the store:

   ```sh
   npm run build:firefox
   npx web-ext sign -s .output/firefox-mv3 --channel unlisted --api-key <JWT issuer> --api-secret <JWT secret>
   ```

3. Open the `.xpi` file it writes to `web-ext-artifacts/` in Firefox.

The add-on ID is `memcode@memcode` (in `wxt.config.ts`). Change it before your first signing if you want your own; it can't change afterwards without losing data.

If you've turned off the add-on's access to LeetCode or NeetCode (Add-ons → MemCode → Permissions), the popup and dashboard show an **Allow access** button.

For development, `npm run dev:firefox` rebuilds `.output/firefox-mv3-dev` on save and uses web-ext to launch Firefox with the add-on loaded.

## How it works

- **Capture.** `entrypoints/page-hook.content.ts` runs in the page's own JS world (a `world: "MAIN"` content script) and watches the site's judge traffic. It only reads that traffic and never changes it.
  - LeetCode: `POST /problems/<slug>/submit/` and `GET /submissions/detail/<id>/check/` (`status_code: 10` means Accepted).
  - NeetCode: `POST /api/executeCodeFunctionHttp` (`status.description === "Accepted"`) and `/api/getProblemMetadataFunctionHttp`.

  On an Accepted result, the isolated content script opens a rating modal in a Shadow DOM. Problem details come from LeetCode GraphQL or NeetCode's metadata API. In Firefox those requests go through `content.fetch` so they're sent as the page (`lib/page-fetch.ts`).
- **Manual save.** The **Save to MemCode** button at the bottom-left of a problem page saves or re-rates at any time. On LeetCode it uses your latest accepted submission. On NeetCode it uses your submission history, or the editor code NeetCode keeps in localStorage (`<slug>_<lang>_tabs`).
- **Scheduling.** `lib/srs.ts` wraps ts-fsrs with minute-level learning steps turned off, so a first "Good" comes back in days rather than minutes. Intervals are capped at one year. Solving a problem again counts as a review.
- **Review.** The dashboard (`dashboard.html`) has a review queue, a library, card details, and settings, including export/import. The toolbar badge shows how many reviews are due.

Both browsers use Manifest V3 from the same source. WXT generates a service-worker background for Chrome and an event-page background plus `browser_specific_settings` for Firefox.

## Sync with GitHub

MemCode can keep your deck in a GitHub repository, so every browser you connect shares the same cards, notes and review history, and the repo's commit history records your progress.

1. Create a private repository (an empty one is fine), e.g. `you/memcode-deck`.
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with access to **only that repository** and the **Contents: Read and write** permission.
3. In MemCode, open **Settings → GitHub sync**, enter the repository and token, and click **Connect**. Do the same in each other browser.

The deck is one file, `memcode.json`, in the same format as **Export JSON**, so you can also download it from GitHub and import it by hand. Changes are pushed about 30 seconds after you make them; other browsers' changes are pulled on browser startup, when the dashboard opens, and every 30 minutes. Each card merges on its own and the most recent change wins, so if you review the *same* problem in two browsers between syncs, only the later review is kept. The token is stored unencrypted in the browser's extension storage and is never exported or synced, which is why it should only have access to that one repo.

## Keyboard

- Rating modal: `1`–`4` to rate, `Esc` to skip.
- Review: `Space` to show the answer, then `1`–`4` to rate.

## Scripts

| Command                           | What it does                                          |
| --------------------------------- | ----------------------------------------------------- |
| `npm run dev` / `dev:firefox`     | Dev build with hot reload                             |
| `npm run build` / `build:firefox` | Production build to `.output/`                        |
| `npm run zip` / `zip:firefox`     | Zip a build for the Chrome Web Store / AMO            |
| `npm test`                        | Unit tests (vitest)                                   |
| `npm run compile`                 | Type-check                                            |
| `npm run lint:firefox`            | Mozilla's add-on linter (what AMO runs)               |
| `npm run e2e`                     | End-to-end smoke tests in Chromium and Firefox        |
| `node scripts/generate-icons.mjs` | Regenerate `public/icon/*.png`                        |

The end-to-end tests fake the judge responses but call the real LeetCode/NeetCode metadata APIs, so they need network access. `e2e/chromium.mjs` uses Playwright's Chromium (`npx playwright install chromium` once). `e2e/firefox.mjs` uses your installed Firefox over WebDriver BiDi; set `FIREFOX_BIN` if it isn't at `/Applications/Firefox.app`.
