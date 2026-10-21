<div align="center">

<img src="docs/logo/logo.svg" alt="ReMCode logo" width="96">

# ReMCode

**Spaced repetition for the LeetCode and NeetCode problems you've already solved.**

A Chrome and Firefox extension that notices when a submission is accepted, saves the problem, your code and a one-line "key insight", and brings it back for review right before you'd forget it.

<img src="docs/screenshots/capture-modal.png" alt="The ReMCode rating modal over a LeetCode problem page right after an Accepted submission" width="860">

</div>

---

## Why

Solving 300 problems doesn't help much if you can't remember how you solved number 40. ReMCode treats each solved problem like an Anki card. You rate how hard it was (**Again / Hard / Good / Easy**), and the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) algorithm schedules the next review, close to the point where you'd otherwise start to forget.

Reviews are **active recall**, not re-solving. You read the problem, work out the pattern, the key invariant and a sketch of the code, then reveal your own notes and solution and rate yourself. A review takes a minute or two instead of twenty.

- **Zero friction.** Nothing to copy or paste. Get an Accepted, press `3`, and the problem is saved.
- **Local only.** No account and no server. Your deck lives in the browser's extension storage.
- **Works where you practice.** LeetCode and NeetCode, in Chrome and Firefox, from one codebase.

---

## Contents

- [A tour of the app](#a-tour-of-the-app)
  - [1. Capture: rate a problem the moment it's accepted](#1-capture-rate-a-problem-the-moment-its-accepted)
  - [2. Save to ReMCode, any time](#2-save-to-remcode-any-time)
  - [3. The toolbar popup](#3-the-toolbar-popup)
  - [4. Review: recall first, then reveal](#4-review-recall-first-then-reveal)
  - [5. Library](#5-library)
  - [6. Card details and history](#6-card-details-and-history)
  - [7. Settings, backup and restore](#7-settings-backup-and-restore)
  - [8. Light, dark and phone-sized](#8-light-dark-and-phone-sized)
- [How scheduling works](#how-scheduling-works)
- [Install](#install)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Privacy and data](#privacy-and-data)
- [Sync with GitHub](#sync-with-github)
- [Development](#development)
- [Further reading](#further-reading)

---

## A tour of the app

### 1. Capture: rate a problem the moment it's accepted

When LeetCode or NeetCode reports **Accepted**, a modal opens over the page. It already has:

- the problem's **title, number and difficulty**, fetched from LeetCode's GraphQL API or NeetCode's metadata API;
- **the exact code you submitted**, its language and runtime, read from the judge request;
- a **Key insight** box for the one sentence that will jog your memory later, such as *"hash map value → index; check the complement before inserting"*;
- four rating buttons, each showing **when you'd see the problem again** for that rating (`1d`, `3d`, `9d`, …).

Press `1`–`4` or click a rating to save. `Esc` skips. A wrong answer or a plain **Run** never opens the modal. Only an accepted **Submit** does.

<p align="center"><img src="docs/screenshots/capture-toast.png" alt="A toast confirming 'Saved Two Sum — Next review in 3 days'" width="560"></p>

A small toast confirms the save and tells you when the problem will come back. **Open** takes you to the card in the dashboard.

The modal renders inside a Shadow DOM, so it never inherits or leaks styles, and it matches the site's light or dark theme on its own. Solving a problem that's already in your deck counts as a review: it reschedules the card, keeps your history, and saves the new code alongside the old (up to five submissions per problem).

### 2. Save to ReMCode, any time

<p align="center"><img src="docs/screenshots/fab.png" alt="The 'Save to ReMCode' button in the bottom-left corner of a problem page" width="300"></p>

Every problem page gets a small **Save to ReMCode** button in the bottom-left corner. Use it to add a problem you solved before installing ReMCode, to re-rate one, or to save when the automatic prompt is turned off. On LeetCode it pulls your latest accepted submission. On NeetCode it uses your submission history, or falls back to the code in the editor. Once a problem is in your deck, the button changes to **In ReMCode**.

### 3. The toolbar popup

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/popup.png" alt="Toolbar popup in light mode showing 5 problems due" width="300"></td>
    <td align="center"><img src="docs/screenshots/popup-dark.png" alt="Toolbar popup in dark mode" width="300"></td>
  </tr>
</table>

The toolbar icon shows a **badge with the number of problems due**. Clicking it opens a quick summary: how many are due, a **Start review** button, the size of your deck, and the problems you've seen most recently. Each one opens its card in the dashboard.

### 4. Review: recall first, then reveal

<img src="docs/screenshots/review-front.png" alt="Review screen: problem statement, recall prompts and a scratch pad, with topics hidden" width="100%">

The review screen shows the problem statement and asks you to recall before you look:

- Which pattern solves it, and what tipped you off?
- What's the key insight or invariant?
- Time and space complexity?
- Sketch the code: data structures, loop shape, edge cases.

A **scratch pad** lets you write your answer down. It's saved with your rating, so the card's history shows how your thinking changed over time. **Topic tags are hidden by default**, because a tag like "Two Pointers" gives the answer away. Click *Show topics (spoiler)* if you're stuck.

Press `Space` (or **Show answer**) to reveal:

<img src="docs/screenshots/review-answer.png" alt="Review screen after reveal: key insight, syntax-highlighted solution, and rating bar with interval previews" width="100%">

You see your **key insight** (still editable, so you can sharpen it) and your **syntax-highlighted solution**, plus a link to re-solve on the original site. A sticky bar at the bottom shows the four ratings and the interval each one would set. Press `1`–`4` and the next card appears.

<img src="docs/screenshots/session-complete.png" alt="Session complete summary with a tally of ratings and the next problem due" width="100%">

When the queue is empty you get a summary of the session and the next problem coming up. You can also **review ahead**, which pulls in the ten problems due soonest when you want extra practice.

### 5. Library

<img src="docs/screenshots/library.png" alt="Library: stats tiles, search and filters, and a table of problems with difficulty, topics, last seen, next review, reps and lapses" width="100%">

The library is your whole deck at a glance.

- **Stats:** total problems, due today, reviewed today, and *mastered* (interval of three weeks or more).
- **Search** across titles, your notes, topics, or a LeetCode number (`42`).
- **Filter** by status (due or scheduled), site, difficulty and topic.
- **Sort** by next due, longest unseen, **most forgotten** (lapses), recently added, or title.
- Each row shows difficulty, topics, when you last saw the problem, when it's next due (overdue items are highlighted), reps and lapses.

### 6. Card details and history

<img src="docs/screenshots/card-detail.png" alt="Card detail page: tags, actions, scheduling stats, key insight, solution, and rating history" width="100%">

Each problem has its own page with:

- **Review now**, which reviews this one card even if it isn't due;
- **Open on LeetCode/NeetCode**, **Reset schedule** and **Delete**;
- scheduling stats: next review, last seen, date added, reps, lapses and FSRS **stability**;
- your key insight, which you can edit at any time;
- every saved solution, with a switcher when there's more than one;
- the original problem statement;
- the **full rating history**, marking each entry as a solve or a review, with any scratch-pad notes you wrote during that review.

### 7. Settings, backup and restore

<img src="docs/screenshots/settings.png" alt="Settings page: target retention, daily review cap, hide topics, capture prompts, and export/import" width="100%">

| Setting | What it does |
| --- | --- |
| **Target retention** (80–97%) | How likely you should be to remember a problem when it comes up. Higher means more frequent reviews. 90% is the default. |
| **Maximum reviews per day** | Caps the daily queue. Extra due cards wait until tomorrow. `0` means no limit. Default is 50. |
| **Hide topics until reveal** | Keeps tags like "Dynamic Programming" off the front of the card. |
| **Prompt on LeetCode / NeetCode** | Turns the automatic prompt on Accepted on or off for each site. The Save button works either way. |
| **Theme** | System, Light or Dark for the dashboard and popup. The on-page modal always matches the site. |
| **GitHub sync** | Keeps the deck in a GitHub repository you own, so all your browsers share it. See [Sync with GitHub](#sync-with-github). |
| **Export / Import JSON** | Back up the whole deck, or move it to another browser. Import merges by problem, and the more recently changed copy wins. |

### 8. Light, dark and phone-sized

The dashboard and popup follow your system theme, or pick **Light** or **Dark** under **Settings → Appearance**. The capture modal follows the theme of the page it's on.

<table>
  <tr>
    <td width="72%"><img src="docs/screenshots/library-dark.png" alt="Library in dark mode"></td>
    <td width="28%"><img src="docs/screenshots/library-mobile-dark.png" alt="Library at phone width in dark mode"></td>
  </tr>
</table>

<details>
<summary>More dark-mode screenshots</summary>

<img src="docs/screenshots/review-front-dark.png" alt="Review screen in dark mode" width="100%">
<img src="docs/screenshots/review-answer-dark.png" alt="Review answer in dark mode" width="100%">

</details>

---

## How scheduling works

ReMCode uses **FSRS** (Free Spaced Repetition Scheduler), the modern scheduler built into Anki. It models each card's *stability* (how long the memory lasts) and *difficulty*, and picks the next interval so that your chance of remembering the problem on that day matches your target retention.

A few choices are specific to coding problems:

- **No minute-level learning steps.** A first "Good" on a fresh solve comes back in days, not ten minutes.
- **Intervals are capped at one year**, so every problem comes back at least once a year.
- **Re-solving counts as a review.** An Accepted on a problem already in your deck reschedules it.
- **Due means due for the whole day**, as in Anki. Cards are ordered most-overdue first.

For the full explanation, including the math, see [§6 of How it works](docs/HOW-IT-WORKS.md#6-spaced-repetition-and-fsrs).

---

## Install

Requires Node 22 or newer (`nvm use` reads `.nvmrc`).

```sh
npm install
npm run build           # Chrome  → .output/chrome-mv3
npm run build:firefox   # Firefox → .output/firefox-mv3
```

**Chrome:** open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `.output/chrome-mv3`.

**Firefox (140+):** to try it out, open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `.output/firefox-mv3/manifest.json`. Temporary add-ons lose their data when Firefox restarts, so for daily use, sign an unlisted build. The steps are in the [original README](docs/ORIGINAL-README.md#install-in-firefox-140).

If you've turned off the extension's access to LeetCode or NeetCode, the popup and dashboard show an **Allow access** button.

---

## Keyboard shortcuts

| Where | Key | Action |
| --- | --- | --- |
| Rating modal | `1` `2` `3` `4` | Again / Hard / Good / Easy |
| Rating modal | `Esc` | Skip |
| Review | `Space` or `Enter` | Show answer |
| Review | `1` `2` `3` `4` | Rate and go to the next card |
| Review scratch pad | `Esc` | Leave the text box so the shortcuts work again |

---

## Privacy and data

- **Nothing leaves your browser** unless you turn on [GitHub sync](#sync-with-github), and then it only goes to your own repository. No account, no analytics, no ReMCode server.
- The extension only **reads** the sites' judge traffic, so it can tell when a submission is accepted. It never changes requests or responses.
- Problem details are fetched from LeetCode and NeetCode **as you**, using your existing session.
- Problem statements are sanitized with DOMPurify before they're shown.
- Your deck is stored in `browser.storage.local`, one key per card. **Export JSON** gives you a portable backup at any time.

---

## Sync with GitHub

ReMCode can keep your deck in a GitHub repository, so every browser you connect shares the same cards, notes and review history, and the repo's commit history records your progress.

1. Create a private repository (an empty one is fine), e.g. `you/remcode-deck`.
2. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with access to **only that repository** and the **Contents: Read and write** permission.
3. In ReMCode, open **Settings → GitHub sync**, enter the repository and token, and click **Connect**. Do the same in each other browser.

The deck is one file, `remcode.json`, in the same format as **Export JSON**, so you can also download it from GitHub and import it by hand. Changes are pushed about 30 seconds after you make them; other browsers' changes are pulled on browser startup, when the dashboard opens, and every 30 minutes. Each card merges on its own and the most recent change wins, so if you review the *same* problem in two browsers between syncs, only the later review is kept. The token is stored unencrypted in the browser's extension storage and is never exported or synced, which is why it should only have access to that one repo.

---

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` / `dev:firefox` | Dev build with hot reload |
| `npm run build` / `build:firefox` | Production build to `.output/` |
| `npm run zip` / `zip:firefox` | Zip a build for the Chrome Web Store / AMO |
| `npm test` | Unit tests (vitest) |
| `npm run compile` | Type-check |
| `npm run lint:firefox` | Mozilla's add-on linter (what AMO runs) |
| `npm run e2e` | End-to-end smoke tests in Chromium and Firefox |
| `npm run screenshots` | Rebuild and regenerate the images in `docs/screenshots/` |

`npm run screenshots` loads the built extension in Playwright's Chromium, seeds a sample deck, and captures every screen in this README. It needs `npx playwright install chromium` once. The LeetCode page in the capture shots is a local stand-in with faked judge and GraphQL responses, so the script runs offline.

**Built with** [WXT](https://wxt.dev) (Manifest V3 for both browsers), React 19, [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), highlight.js, marked and DOMPurify.

```
entrypoints/   background, content scripts (LeetCode, NeetCode, page hook), popup, dashboard
components/    capture modal, rating buttons, code block, notes editor
lib/           FSRS wrapper, storage, judge-traffic parsing, site APIs
tests/         vitest unit tests
e2e/           Playwright / WebDriver BiDi smoke tests
docs/          deep-dive docs and screenshots
```

---

## Further reading

- **[How ReMCode works](docs/HOW-IT-WORKS.md):** a guided tour of the internals. It covers extension contexts and worlds, hooking `fetch`/`XMLHttpRequest`, LeetCode's judge protocol, Shadow DOM, FSRS, Chrome vs Firefox, and testing.
- **[Original README](docs/ORIGINAL-README.md):** the earlier, more technical README, with full Firefox signing steps, capture endpoints and e2e details.
