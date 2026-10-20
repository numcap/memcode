# How MemCode works

A guide to every moving part of this extension, written for someone who already knows React, HTML, CSS and JavaScript. It spends its time on what's probably new to you: how browser extensions are put together, how MemCode notices a solve on someone else's website, the memory model behind the scheduling, and the cross-browser and testing problems that came up.

**How to use it.** Each section ends with a **Check yourself** block. Answer those questions in your head (or out loud) *before* you open the answers. Struggling to recall something is what makes it stick; that's the same idea the extension is built on. The final quiz mixes topics on purpose.

Code excerpts are simplified. The real files are linked so you can compare.

---

## Contents

1. [The 30-second version](#1-the-30-second-version)
2. [Browser extensions 101: the parts that aren't web dev](#2-browser-extensions-101-the-parts-that-arent-web-dev)
3. [WXT: the build tool](#3-wxt-the-build-tool)
4. [Capturing a solve, step by step](#4-capturing-a-solve-step-by-step)
5. [Putting UI on someone else's page](#5-putting-ui-on-someone-elses-page)
6. [Spaced repetition and FSRS](#6-spaced-repetition-and-fsrs)
7. [Data and state](#7-data-and-state)
8. [The extension pages (React)](#8-the-extension-pages-react)
9. [The background script](#9-the-background-script)
10. [Chrome vs Firefox](#10-chrome-vs-firefox)
11. [Testing](#11-testing)
12. [Smaller things worth knowing](#12-smaller-things-worth-knowing)
13. [When something breaks: a debugging playbook](#13-when-something-breaks-a-debugging-playbook)
14. [File map](#14-file-map)
15. [Final quiz and exercises](#15-final-quiz-and-exercises)

---

## 1. The 30-second version

You submit a solution on LeetCode or NeetCode. MemCode is watching the site's network traffic from inside the page. When the judge's response says **Accepted**, MemCode pops up a modal asking how hard the problem was. Your rating, code and notes are saved to the browser's extension storage. A scheduling algorithm (FSRS) uses the rating to decide when you should see the problem again. When it's due, the dashboard shows you the problem, you try to recall the approach, reveal your own solution, and rate yourself again. Each rating reshapes the schedule.

```
 leetcode.com tab                                     extension
┌──────────────────────────────────────────────┐    ┌─────────────────────────────┐
│ PAGE (MAIN world)                            │    │ background script           │
│  LeetCode's own JS                           │    │  - toolbar badge (due count)│
│  page-hook.content.ts  ← wraps fetch/XHR     │    │  - opens dashboard tabs     │
│        │ window.postMessage("accepted")      │    └──────────▲──────────────────┘
│        ▼                                     │               │ runtime.sendMessage
│ ISOLATED world                               │               │
│  leetcode.content.tsx                        │───────────────┘
│   - fetches problem info (GraphQL)           │
│   - Shadow DOM: floating button + modal      │──── storage.local.set(card) ───┐
└──────────────────────────────────────────────┘                                │
                                                                                ▼
 extension pages (chrome-extension://<id>/…)              ┌───────────────────────────┐
┌──────────────────────────────────────────┐              │ browser.storage.local     │
│ popup.html      due count, recent         │◄────────────►│  card:leetcode:two-sum    │
│ dashboard.html  review / library / card   │  get / set / │  card:neetcode:…          │
│                 / settings                │  onChanged   │  settings                 │
└──────────────────────────────────────────┘              └───────────────────────────┘
```

Keep this picture in mind; every section below zooms into one box or arrow.

---

## 2. Browser extensions 101: the parts that aren't web dev

### 2.1 An extension is a folder plus a manifest

A built extension (`.output/chrome-mv3/`) is just HTML, JS, CSS and images, plus a `manifest.json` that tells the browser:

- **what to run where:** which scripts to inject into which sites, and when;
- **what it's allowed to do:** permissions such as `storage` and `alarms`, and *host permissions* such as `https://leetcode.com/*`;
- **what the UI is:** the toolbar icon, popup page and icons.

The browser loads those files from a special origin: `chrome-extension://<id>/` in Chrome, `moz-extension://<uuid>/` in Firefox. Pages served from there get access to the `chrome.*` / `browser.*` APIs that normal web pages never have. Have a look at `.output/chrome-mv3/manifest.json` after a build; it's short.

### 2.2 The four places extension code runs

This is the biggest mental shift from normal web development. An extension isn't one program. It's several pieces running in different places with different powers, and they talk by passing messages.

| Context | MemCode file(s) | Lives… | Can use | Can't |
|---|---|---|---|---|
| **Background** (a service worker in Chrome, an "event page" in Firefox) | `entrypoints/background.ts` | No DOM. Started on demand, killed when idle | All extension APIs: `action` (badge), `alarms`, `tabs`, `storage` | Touch any web page's DOM |
| **Content script, isolated world** | `leetcode.content.tsx`, `neetcode.content.tsx` | Inside the web page, for as long as the tab lives | The page's **DOM**, `storage`, `runtime.sendMessage` | See the page's JS variables; use `tabs` or `action` |
| **Content script, MAIN world** | `page-hook.content.ts` | Inside the page's own JS environment | Everything the page's JS can: patch `window.fetch`, etc. | **Any** extension API, not even storage |
| **Extension pages** | `popup/`, `dashboard/` | Normal tabs or popups, served from the extension's origin | All extension APIs, plus a normal DOM for React | Read other sites' pages directly |

MemCode needs all four. Most of the architecture comes from *which context is allowed to do what*.

### 2.3 Worlds: the most important concept in this project

A content script shares the **DOM** with the page but not its **JavaScript**. Each runs in a separate *world*: its own global object, its own `window.fetch`, its own variables. Both can see `document.body`, but if LeetCode's code sets `window.foo = 1`, your content script sees `window.foo === undefined`.

```
              ┌───────────── the DOM (shared) ─────────────┐
              │  <body>  <div id="app">…</div>  </body>      │
              └──────────────▲─────────────────▲────────────┘
                             │                 │
   ┌─────────────────────────┴───┐   ┌─────────┴───────────────────────┐
   │ MAIN world (the page's)     │   │ ISOLATED world (MemCode's)      │
   │ window.fetch  ← LeetCode    │   │ window.fetch  ← a different one │
   │   uses THIS one             │   │ browser.storage, runtime …      │
   └─────────────────────────────┘   └─────────────────────────────────┘
```

**Why this matters for MemCode.** To see what LeetCode's code sends and receives, we have to replace *the page's* `fetch`. Replacing `window.fetch` in the isolated world does nothing to LeetCode, because LeetCode never calls that copy. So the hook must run in the **MAIN world**, but the MAIN world has no extension APIs and can't save anything. That's why capture is split in two:

- `page-hook.content.ts` (`world: 'MAIN'`) observes traffic and announces "Accepted!"
- `leetcode.content.tsx` (isolated) listens, fetches details, shows the UI and saves.

The isolation is a security feature. Without it, any website could call `chrome.storage` or `chrome.runtime.sendMessage` by pretending to be the extension.

### 2.4 How the contexts talk

| From → To | Mechanism | Where MemCode uses it |
|---|---|---|
| MAIN world → isolated world | `window.postMessage(msg, origin)`, both listen on the same `window` | The hook announcing an Accepted submission or NeetCode metadata |
| Content script / page → background | `browser.runtime.sendMessage(msg)` | "Open the dashboard at this card" (content scripts can't open extension tabs) |
| Anyone → anyone, via data | `storage.local.set` plus `storage.onChanged` | Save a card in the content script; the dashboard, popup and badge update themselves |

**Trust.** `window.postMessage` is a public channel: *any* script on leetcode.com, including ads or a malicious script, can post `{ source: 'memcode-hook', … }`. So the isolated script treats those messages as hints, not commands. The worst a forged message can do is open the rating modal; nothing is saved unless you click a rating. Checking `e.source === window` and `e.origin === location.origin` filters out messages from iframes and other origins. See `components/startCapture.tsx`.

> **Design rule worth keeping:** decide which side of a boundary is trusted, and make the untrusted side only able to *ask*.

### 2.5 Permissions, host permissions and origins

- `storage`: the `browser.storage` API.
- `unlimitedStorage`: lifts the quota of about 10 MB on `storage.local`. Problem statements and code add up.
- `alarms`: wake the background on a schedule (see 2.6).
- **Host permissions** (`https://leetcode.com/*`, `https://neetcode.io/*`): permission to inject scripts into those sites. Chrome grants them at install. **Firefox lets users revoke them per site**, which is why there's an "Allow access" banner (`components/SiteAccessBanner.tsx`).
- `web_accessible_resources`: files a *web page* is allowed to load from the extension. WXT adds our content-script CSS here because the CSS is loaded into the Shadow DOM from the page's side (section 5).

### 2.6 Manifest V3: the background dies

In Manifest V2 the background page ran forever. In **Manifest V3** (required by Chrome, and what we use in Firefox too) the background is a **service worker**, or an **event page** in Firefox. The browser starts it when an event arrives and **kills it after roughly 30 seconds idle**.

What that means in practice:

- **No `setInterval` in the background.** It would silently stop when the worker is killed. To keep the badge accurate as cards become due over time, `background.ts` registers `browser.alarms.create(..., { periodInMinutes: 15 })`. Alarms survive the worker being killed and wake it up.
- **No state in global variables.** Anything stored in a global is gone on the next wake. All state lives in `storage.local`.
- **Register listeners at the top level, synchronously,** so the browser knows which events should wake the worker.

### 2.7 `storage.local` is not `localStorage`

| | `window.localStorage` | `browser.storage.local` |
|---|---|---|
| Belongs to | A **website's** origin (leetcode.com) | The **extension** |
| Visible from | That site's pages | Every extension context: background, content scripts, popup, dashboard |
| API | Synchronous, strings only | Async (Promises), structured data |
| Change events | `storage` event, other tabs only | `storage.onChanged` everywhere |
| Cleared when | The user clears site data | The extension is uninstalled |

MemCode uses **both**, for different things. Its own data lives in `storage.local`. It *reads* NeetCode's `localStorage` (from the content script, which shares the page's origin) to grab the code in NeetCode's editor.

<details>
<summary><b>Check yourself (section 2)</b></summary>

1. Why can't the network hook live in the same file as the code that saves cards?
2. The background needs to update the badge when a card becomes due at 3 a.m. Why does `setInterval` fail here, and what does MemCode use instead?
3. A hostile ad script on leetcode.com posts a fake `{source:'memcode-hook', event:{type:'accepted', …}}`. What's the worst that happens, and why?

**Answers**
1. Patching LeetCode's `fetch` requires the MAIN world, which has no extension APIs. Saving requires `storage`, which only the isolated world (or extension pages) has.
2. The MV3 background is killed when idle, taking its timers with it. `alarms` persist and wake the worker.
3. A rating modal opens. Nothing is written unless you click a rating, because messages are treated as hints, not commands.
</details>

---

## 3. WXT: the build tool

Writing extensions by hand means writing `manifest.json` yourself, bundling each entry point separately (content scripts can't load ES modules from the network), and keeping Chrome and Firefox manifests in sync. [WXT](https://wxt.dev) does that for us.

- **File-based entrypoints.** Each file or folder in `entrypoints/` becomes one piece of the extension. `background.ts` becomes the background, `*.content.ts(x)` a content script, `popup/` the toolbar popup, and any other folder with `index.html` (like `dashboard/`) a page at `/dashboard.html`.
- **Config inside the file.** `defineContentScript({ matches, world, runAt, main })` declares where and when a script runs. WXT reads it and writes the manifest entry. `wxt.config.ts` holds the global manifest fields.
- **Per-browser builds.** `wxt build` produces `.output/chrome-mv3/`, and `wxt build -b firefox` produces `.output/firefox-mv3/`. The manifest function in `wxt.config.ts` receives `{ browser }` so Firefox can get its extra `browser_specific_settings`.
- **Vite underneath.** Imports, TypeScript, JSX and CSS all just work, and each content script is bundled into one self-contained file. That's why `page-hook.js` is only 4 KB: it imports nothing heavy.
- **Helpers we use:** `createShadowRootUi` (section 5), `ctx` (the content-script context: timers and listeners that clean themselves up if the extension reloads), the `wxt:locationchange` event, the `browser` object (the same API in Chrome and Firefox), and `fakeBrowser` for tests.
- **`wxt prepare`** (run by `postinstall`) generates `.wxt/`: TypeScript config, path aliases like `@/lib/...`, and types. If your editor ever complains about `@/` imports, run `npx wxt prepare`.

<details>
<summary><b>Check yourself (section 3)</b></summary>

1. Where does `manifest.json` come from, given there isn't one in the repo?
2. You add `entrypoints/stats/index.html`. What URL serves it?

**Answers**
1. WXT generates it at build time from `wxt.config.ts` plus the options in each entrypoint (`defineContentScript`, etc.).
2. `chrome-extension://<id>/stats.html` (or `moz-extension://…/stats.html`).
</details>

---

## 4. Capturing a solve, step by step

### 4.1 Monkey-patching `fetch` and `XMLHttpRequest`

"Monkey-patching" means replacing a built-in function with your own wrapper that calls the original. The page's code doesn't know the difference.

```js
// entrypoints/page-hook.content.ts (simplified)
const originalFetch = window.fetch;
window.fetch = async function (input, init) {
  const watched = inspector.wants(url, method) ? { url, method, body: readBody(input, init) } : undefined;
  const response = await originalFetch.call(this, input, init);   // the real request
  if (watched) {
    Promise.all([watched.body, response.clone().text()])          // read a COPY…
      .then(([reqBody, resText]) => report(url, method, reqBody, resText));
  }
  return response;                                                 // …and hand back the original untouched
};
```

Four details matter here:

1. **`runAt: 'document_start'`.** The hook must be installed *before* LeetCode's scripts run. If LeetCode captured a reference to the original `fetch` first, our patch would never see its calls.
2. **Bodies are streams, and streams can be read only once.** If the hook called `response.text()` on the real response, LeetCode's own `.json()` would fail with "body already used". `response.clone()` splits the stream so each side gets its own copy. The same goes for a `Request` object passed as `input`: it has to be cloned *before* calling the original fetch, which consumes it.
3. **Never block or break the page.** We `return response` immediately; inspection happens in the background with errors swallowed. An observer that can crash the site it observes is a liability.
4. **XHR too.** Not every site uses `fetch`. NeetCode is an Angular app, and Angular's `HttpClient` uses `XMLHttpRequest` by default. We wrap `XMLHttpRequest.prototype.open` (to remember method and URL in a `WeakMap`) and `.send` (to listen for `load`). The `WeakMap` matters: it attaches data to each XHR object without changing it, and lets entries be garbage-collected with the request.

### 4.2 LeetCode's judge protocol: submit, then poll

Judging takes a few seconds, so LeetCode doesn't answer the submit request with a verdict. It uses a **submit-then-poll** pattern:

```
browser                                         leetcode.com
  │ POST /problems/two-sum/submit/                    │
  │   {lang, question_id, typed_code}  ─────────────► │
  │ ◄───────────────────────  {submission_id: 987654} │
  │                                                   │
  │ GET /submissions/detail/987654/v2/check/  ──────► │  (repeated, backing off)
  │ ◄───────────────────────  {state:"RUNNING_TESTS"} │
  │ GET /submissions/detail/987654/v2/check/  ──────► │
  │ ◄──  {state:"SUCCESS", ai_state:"STARTED", …}     │   judge done, AI judge still running
  │ GET /submissions/detail/987654/v2/check/  ──────► │
  │ ◄──  {state:"SUCCESS", ai_state:"SUCCESS",        │
  │       status_code:10, compare_result:"111…", …}   │   10 = Accepted, 11 = Wrong Answer, …
```

The **Run** button uses a different endpoint (`/interpret_solution/`) whose check IDs look like `runcode_…`. Our check-URL pattern only matches numeric IDs, so Run results never trigger the modal.

**A lesson from the first real-world bug.** The first version of MemCode only knew the original `/submissions/detail/<id>/check/` URL. LeetCode's Submit button had since moved to `submitV2`, which polls `/v2/check/`. The hook saw every one of those requests, didn't recognize the URL, and ignored them, so no modal appeared on either browser. The mocked e2e tests didn't catch it because the mocks used the URL I *assumed*. The fix came from reading LeetCode's current bundle (the method in 4.5):

- The route table has `submitResultV2: id => /submissions/detail/${id}/v2/check/`.
- `onSubmitClicked` calls `submitV2`.
- The client treats a result as final only when `state` is `SUCCESS` **and** the AI judge (`ai_state`) has finished.
- It downgrades status 10 to Wrong Answer if `compare_result` contains a `0`.

`isLeetcodeAccepted` now mirrors those rules exactly. The takeaway: **mocks only prove you handle the shape you wrote down.** Check them against the real thing when you can.

### 4.3 The `TrafficInspector`: a small state machine

`lib/hook.ts` turns that traffic into at most one `accepted` event per submission:

- On **submit**: remember `submission_id → { slug, lang, code }` in `pending`. The code comes from the *request* body, so we get exactly what you submitted.
- On **check** (`/check/` or `/v2/check/`): if `isLeetcodeAccepted` says the verdict is a final Accepted (`state` SUCCESS, `status_code` 10, every test passed, AI judge finished) and this ID hasn't been `reported` yet, mark it reported and emit `{ type: 'accepted', slug, code, lang, runtime, memory }`.
- **Polling dedupe:** the check endpoint is hit repeatedly (and could be re-polled later), so the `reported` set guarantees a single modal.
- **Missed submit:** if the submit request wasn't seen (rare), we still emit, using the slug from the page URL and no code. The isolated script then fetches your latest accepted code over GraphQL.

NeetCode is simpler. Its submit call `POST /api/executeCodeFunctionHttp` with `{data:{problemId, rawCode, lang}}` returns the verdict directly: `{data:{status:{description:"Accepted"}, time, …}}`. There's no polling.

Note that `TrafficInspector` touches **no DOM and no browser APIs**: it takes strings in and returns an event or `null`. That's deliberate; see "functional core" in section 11.

### 4.4 Fetching problem details: GraphQL, cookies and CSRF

Once the isolated script hears "accepted for `two-sum`," it needs the title, difficulty, tags and description. LeetCode serves those through **GraphQL**: one endpoint (`POST /graphql`) where the client sends a query listing exactly the fields it wants.

```graphql
query memcodeQuestion($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId title titleSlug content difficulty topicTags { name }
  }
}
```

The response mirrors the shape of the query. (`lib/leetcode.ts` also uses `questionSubmissionList` and `submissionDetails` for the manual-save button; those return data only when you're logged in.)

Because the content script runs *on* leetcode.com, this is a **same-origin** request, so the browser sends your session cookie automatically. There's one more piece: **CSRF protection**. Many backends (LeetCode's included) use the *double-submit cookie* pattern:

1. The server sets a cookie, `csrftoken=abc`.
2. Requests that change state must also send the value in a header, `x-csrftoken: abc`.
3. A malicious site can make your browser *send* the cookie, but the same-origin policy stops it from *reading* the cookie, so it can't fill in the header.

`csrfToken()` in `lib/leetcode.ts` reads the cookie from `document.cookie` and copies it into the header, just as LeetCode's own frontend does. Servers also often check the `Origin`/`Referer` headers, which matters in Firefox (section 10).

### 4.5 How NeetCode was figured out (a method you can reuse)

There's no documentation for NeetCode's internals, so I read its JavaScript:

1. `curl` the problem page, find `<script src="main.<hash>.js">` and `runtime.<hash>.js`.
2. The **runtime** chunk contains a map of every lazy-loaded chunk (`{47:"644a…", 363:"685b…", …}`). Download all of them (152 files).
3. Search the minified code for strings that can't be minified: `localStorage.setItem(`, `"Accepted"`, `callable(`. Minifiers rename variables, but not string literals or property names that come from the server.
4. That turned up:
   - the editor-code key templates `` `${problemId}_${lang}_tabs` `` and `` `${problemId}_${lang}` ``;
   - `submitCode()` calling `httpCallable.callable("executeCodeFunctionHttp")({problemId, rawCode, lang})`;
   - the wrapper that posts `{data: …}` to `` `${baseUrl}/${name}` `` with `baseUrl = "/api"`;
   - the UI reading `response.status.description === "Accepted"`.
5. Confirm with a real request: `curl -X POST https://neetcode.io/api/getProblemMetadataFunctionHttp -d '{"data":{"problemId":"two-integer-sum"}}'` returned the title, difficulty, topics and a **Markdown** description. That's why `marked` is a dependency.

The same approach works for almost any web app. **The network tab plus string-literal search through the bundles** tells you most of what you need.

<details>
<summary><b>Check yourself (section 4)</b></summary>

1. The hook reads `response.text()` on the *original* response instead of a clone. What breaks, and for whom?
2. Why does clicking **Run** on LeetCode never open the modal?
3. Why would the hook miss everything if it ran at `document_idle` instead of `document_start`?
4. The CSRF token is in a cookie the browser sends automatically. Why does the header copy still provide protection?

**Answers**
1. LeetCode's own code breaks: its `.json()` call fails because the body stream was already consumed. That's a broken site, caused by the extension.
2. Run uses `/interpret_solution/` and its check IDs aren't numeric, so `wants()` rejects them.
3. LeetCode's code may keep its own reference to the original `fetch` (or start requests) before the hook installs, so those calls bypass the wrapper.
4. An attacker's page can make the browser *send* cookies but can't *read* them (same-origin policy), so it can't put the right value in the header.
</details>

---

## 5. Putting UI on someone else's page

### 5.1 Shadow DOM: CSS isolation in both directions

If we added `<div class="modal">` straight into LeetCode's DOM, LeetCode's CSS would style it (maybe `.modal { display: none }`), and our CSS could break LeetCode. **Shadow DOM** prevents both:

```html
<memcode-capture>               ← the "shadow host", a normal element in LeetCode's DOM
  #shadow-root (open)           ← a separate DOM tree with its own style scope
    <style>/* our CSS */</style>
    <div class="mc-theme mc-capture">…React renders here…</div>
</memcode-capture>
```

- Selectors outside don't match inside, and selectors inside don't match outside.
- **Exceptions:** *inherited* properties (`font`, `color`, `line-height`…) and **CSS custom properties** pass through the boundary. WXT resets inherited properties by applying `all: initial` on the host. `rem` units still follow the page's `<html>` font size.
- `:root` doesn't match inside a shadow root, which is why the design tokens in `components/theme.css` are on a **class** (`.mc-theme`) that both the extension pages and the shadow root use.
- **Loading the CSS:** with `cssInjectionMode: 'ui'`, WXT doesn't inject our CSS into the page. `createShadowRootUi` fetches the built CSS file and puts it inside the shadow root. Fetching that file from the page side is why it has to be listed in `web_accessible_resources`.
- `position: fixed` inside the shadow root still positions against the viewport (unless an ancestor has a `transform`), so the floating button and modal work normally.

### 5.2 Keyboard isolation and event retargeting

LeetCode has global keyboard shortcuts. Typing "3" in our notes box shouldn't trigger anything in LeetCode. `isolateEvents: true` calls `stopPropagation()` on `keydown`/`keyup`/`keypress` at the shadow root, so the page never hears them.

Related: when an event *does* leave a shadow root, it's **retargeted**. Outside listeners see `event.target` as the host element (`<memcode-capture>`), not the button inside. Shadow DOM hides its internals even from events.

### 5.3 Single-page apps and the navigation-timing bug

Content scripts declared in the manifest are injected on **real page loads** only. LeetCode and NeetCode are SPAs: clicking from `/problemset` to `/problems/two-sum` changes the URL with `history.pushState` and loads no new page. Two consequences:

1. The content scripts match the **whole site** (`https://leetcode.com/*`), not `/problems/*`. Otherwise, arriving from the problem list would mean no script at all.
2. The floating button must react to URL changes. WXT's `wxt:locationchange` event handles that.

**A bug we hit:** the first version did `onLocationChange(() => setSlug(slugFrom(location.pathname)))` and the button never appeared after client-side navigation. WXT uses the **Navigation API**'s `navigate` event when it's available, and that event fires *before* the URL changes, so `location.pathname` was still the old path. The fix is to use the URL the event carries (`e.newUrl`). When an event says "something is about to happen," don't read the state it's about to change.

### 5.4 Matching the site's theme

The modal should look native on a dark LeetCode and a light one. `detectPageTheme()` in `components/CaptureApp.tsx` reads the page's computed `background-color` and computes **relative luminance**, `0.2126·R + 0.7152·G + 0.0722·B`. The weights reflect how sensitive the eye is to each color (very sensitive to green, barely to blue). Below 128 counts as dark. This is cheaper and more reliable than knowing each site's theme class names.

<details>
<summary><b>Check yourself (section 5)</b></summary>

1. Name two kinds of styling that *do* cross a shadow boundary.
2. Why match `https://leetcode.com/*` instead of `https://leetcode.com/problems/*`?
3. What was wrong with reading `location.pathname` inside the location-change handler?

**Answers**
1. Inherited properties (font, color…) and CSS custom properties. (Also `rem`, via the page's root font size.)
2. Client-side navigation doesn't load a new document, so a script restricted to `/problems/*` would never be injected if you started on another page.
3. The Navigation API's `navigate` event fires before the URL is committed, so it still held the old path.
</details>

---

## 6. Spaced repetition and FSRS

### 6.1 Why it works

Three findings from memory research:

- **The forgetting curve.** After you learn something, the chance you can recall it decays over time, fast at first and then slower.
- **The spacing effect.** Reviews spread out over time produce far more durable memory than the same number crammed together.
- **The testing effect (active recall).** *Trying to retrieve* an answer strengthens memory much more than re-reading it, especially when retrieval is effortful but succeeds.

So the ideal is to review each item **just before you'd forget it**, by **actively recalling it**. The review screen therefore shows the problem, asks you to recall the pattern, key insight, complexity and code sketch, and only then reveals your solution. Re-reading your code wouldn't do the same job.

### 6.2 The FSRS model

FSRS ("Free Spaced Repetition Scheduler") is the algorithm modern Anki uses. It models each card with three numbers:

| Symbol | Name | Meaning |
|---|---|---|
| **D** | Difficulty (1–10) | How inherently hard this item is *for you* |
| **S** | Stability (days) | How long the memory lasts: specifically, the number of days until recall probability falls to **90%** |
| **R** | Retrievability (0–1) | Probability you could recall it *right now* |

R comes from a forgetting curve:

$$R(t, S) = \left(1 + F\cdot\frac{t}{S}\right)^{-w_{20}}$$

Here *t* is the days since the last review, w₂₀ is a decay parameter (0.1542 by default in ts-fsrs), and *F* is chosen so that **R = 0.9 exactly when t = S**. That property is what "stability" means.

**What a rating does:**

- **First rating:** the initial stability is a learned constant per button. With the defaults that's Again 0.21 days, Hard 1.29, Good 2.31, Easy 8.30.
- **Later reviews:** a *successful* review multiplies S by a factor that is larger when the card is easy (low D), when S is still small, and **when R was low at review time**. Recalling something you were close to forgetting strengthens it most; that's the "desirable difficulty" effect, built into the math. **Again** (a *lapse*) resets S to a much smaller post-lapse value and increments `lapses`.
- **Difficulty** moves up after Again/Hard and down after Easy, and drifts back toward a default over time.

FSRS's 21 parameters (w₀…w₂₀) were fit on hundreds of millions of real Anki reviews. MemCode uses the defaults; they could be personalized later from your review log.

### 6.3 From a retention target to an interval

You choose a **desired retention** *r* (Settings, default 0.9). The next interval is the time at which R would fall to *r*:

$$I = \frac{S}{F}\left(r^{-1/w_{20}} - 1\right)$$

With *r* = 0.9 that simplifies to **I = S**, so the interval equals the stability. Raising *r* to 0.97 gives much shorter intervals and many more reviews: workload rises steeply as *r* approaches 1. That's why 0.9 is the usual default.

**Worked example (fuzz off, defaults):** a new card rated **Good** gets S ≈ 2.31, so an interval of about 2 days. ts-fsrs also enforces Again < Hard < Good < Easy by at least a day each, which is why the modal showed `1d / 2d / 3d / 8d`. Rate Good again on day 3 and S grows to about 14, then about 57, then about 196 days. Each success pushes the next review much further out.

### 6.4 MemCode's choices (in `lib/srs.ts` and `lib/storage.ts`)

| Choice | Why |
|---|---|
| `enable_short_term: false` | Anki's "learning steps" re-show a new card after 1 and 10 **minutes**. That makes sense for vocabulary, not for a LeetCode problem you just solved. With it off, the first Good is days away. |
| `maximum_interval: 365` | For interview prep, every problem should come back at least once a year. |
| `enable_fuzz: true` | Adds a little random jitter to intervals of 2.5 days or more, so 20 problems solved on one day don't all come due on the same future day. |
| Due by **calendar day** (`isDue`: `due < startOfTomorrow`) | Like Anki: a card due at 3 p.m. today is reviewable this morning. Being reviewed a few hours early barely changes the math. |
| Re-solving counts as a review | Solving a problem again *is* a strong retrieval, so `applySolve` runs the same FSRS update and logs it as `kind: 'solve'`. |
| Daily cap excludes solves | The cap limits *reviews* you do in the dashboard, not problems you solve on the site. |

<details>
<summary><b>Check yourself (section 6)</b></summary>

1. In one sentence, what does "stability = 10 days" mean?
2. At desired retention 0.9, how long is the interval for a card with S = 10? What happens to it if you set retention to 0.8?
3. Why does a successful review when R was low increase stability more than one when R was high?
4. Why turn off short-term learning steps for this app?

**Answers**
1. Ten days after the last review, your chance of recalling it will have dropped to 90%.
2. 10 days. At 0.8 the interval gets *longer*, because you accept more forgetting.
3. Effortful-but-successful retrieval strengthens memory more (desirable difficulty), and FSRS's stability-increase formula reflects that.
4. A minutes-later re-review of a coding problem you just solved is pointless; you want days.
</details>

---

## 7. Data and state

### 7.1 The card

```ts
// lib/types.ts (abridged)
interface Card {
  id: 'leetcode:two-sum';            // `${source}:${slug}`
  source; slug; title; url; difficulty; tags; descriptionHtml; frontendId?;
  notes: string;                     // your key insight
  submissions: Submission[];         // newest first, max 5, deduped by (code, lang)
  srs: SrsState;                     // FSRS state, with dates as epoch millis
  reviewLog: { at; rating; kind: 'solve' | 'review' }[];
  createdAt: number; lastSeenAt: number;   // lastSeenAt drives "seen N days ago"
  updatedAt?: number;                // any change at all; what sync and import compare
}
```

### 7.2 One key per card, and the lost-update problem

Everything could live in one `cards` array, but then saving one rating rewrites *every* card, and two writers can overwrite each other. Instead each card has its own key: `card:leetcode:two-sum`.

That only narrows the race, so the classic **lost update** can still happen to a single card:

```
dashboard tab                        another tab
read card  (notes: "old")
                                     read card (notes: "old")
                                     write card (notes: "NEW")
write card (rating added, notes: "old")   ← "NEW" is lost
```

The fix is to **read right before writing** and only change what you mean to change. `updateCard(id, patch)` in `lib/storage.ts` re-reads the stored card and applies `patch` to *that*. `recordReview` and the notes editor both use it. A unit test (`tests/capture.test.ts`) checks that a review doesn't clobber notes edited elsewhere. (It isn't a database transaction, but it shrinks the window from minutes to milliseconds.)

### 7.3 Why dates are numbers

ts-fsrs works with `Date` objects, but Chrome's storage serializes values much like JSON, so a `Date` comes back as a **string**, not a `Date`. Rather than trust each browser's serializer, `srs.ts` converts to epoch milliseconds (`serialize`) and back (`deserialize`) at the boundary. The round-trip has a unit test.

### 7.4 Live UIs from a shared store

`storage.onChanged` fires in **every** extension context whenever anything writes. The dashboard's `useCards()` hook (`entrypoints/dashboard/hooks.ts`) reloads on any `card:*` change. So rating a problem on leetcode.com updates an already-open dashboard tab, and the background updates the badge, with no explicit messaging between them. Storage is effectively the shared event bus.

### 7.5 Export and import: a simple sync rule

Import merges by `id` using **last writer wins** on `changedAt(card)` (its `updatedAt`, or `lastSeenAt` for cards saved before `updatedAt` existed): if the imported copy changed more recently, it replaces the local one; otherwise it's skipped. It's simple and predictable. The cost is that edits on the "older" side are dropped rather than merged field by field, which is fine for occasional backups and moving between browsers.

Why not compare `lastSeenAt` alone? Editing notes or resetting a schedule doesn't "see" the problem, so it doesn't move `lastSeenAt`, and the edit would lose to any older copy. `saveCard` therefore stamps `updatedAt` on every write.

### 7.6 GitHub sync

Sync is the same rule run automatically against one file in a GitHub repo, `memcode.json`, which has the export format. Four pieces:

- **`lib/merge.ts`** (pure): `mergeDecks(local, remote)` keeps the newer copy of each card and says what to write locally and whether the remote needs a commit. "Did it change?" compares card ids, `changedAt`s, tombstones and the settings timestamp, never `exportedAt`, so an idle sync makes no commit.
- **Tombstones.** If deleting a card just removed its key, the next sync would bring it back from GitHub. `deleteCard` also records `deleted[id] = now`, and the merge drops any copy that isn't newer than its tombstone. Solving that problem again later makes a newer copy, which wins and clears the tombstone.
- **`lib/github.ts`**: the REST contents API. Every write sends the `sha` of the file it read, and GitHub refuses it (409) if someone else pushed in between. That's **optimistic concurrency**: `lib/sync.ts` then reads again, re-merges on top of the other browser's version, and retries (up to 3 times). Reads use `cache: 'no-store'`, because GitHub marks API responses cacheable for 60 s and a stale read would look like a conflict every time.
- **`entrypoints/background.ts`** is the only place sync runs, so two syncs never race inside one browser (`syncNow` also queues calls). Any write to `card:*`, `settings` or `deleted` re-creates a 30-second alarm, so a burst of edits becomes one commit. An alarm rather than `setTimeout`, because the MV3 background can be stopped before a timer fires. There is also a 30-minute alarm, a sync on browser startup, and the dashboard asks for one when it opens.

The settings page (`entrypoints/dashboard/SyncPanel.tsx`) checks the repo with the token before saving it. The token lives in `storage.local` under `github` and is deliberately left out of `exportData`. No extra permission is needed: `api.github.com` sends CORS headers that allow any origin.

<details>
<summary><b>Check yourself (section 7)</b></summary>

1. Each card has its own key. Why do we still need `updateCard`?
2. What would go wrong if `srs.due` were stored as a `Date`?
3. You delete a card in Chrome and it syncs. Firefox still has the card. Why doesn't Firefox's next sync put it back on GitHub?

**Answers**
1. Two writers can still race on the *same* card (a review vs a notes edit). Re-reading right before writing keeps the other writer's change.
2. Chrome would serialize it to a string, and `due < now` comparisons and ts-fsrs would get the wrong type.
3. GitHub now holds Chrome's tombstone, which is newer than Firefox's copy of the card. The merge drops the copy and Firefox deletes it locally.
</details>

---

## 8. The extension pages (React)

### 8.1 Hash routing

The dashboard is a static file, `dashboard.html`, with no server behind it, so a path like `/dashboard/library` can't be rewritten to that file. Routes therefore live in the **hash**: `dashboard.html#/library`, `#/card/leetcode%3Atwo-sum`, `#/review?card=…`. Changing the hash never reloads the page; `useRoute()` listens to `hashchange`. It's about 25 lines and needs no router library.

### 8.2 The review session is a snapshot

When a session starts, `Review.tsx` builds the queue **once** and keeps it in state. If the queue were derived live from storage, rating card 1 would trigger `onChanged`, the queue would be recomputed, and the order would shift under you. The end-of-session screen deliberately reads **live** data, because that's where "what's due next?" has to reflect the new schedules.

Keyboard shortcuts use a `window` `keydown` listener that ignores keys typed into textareas (`Escape` blurs them instead). Hardening found in Firefox testing: `e.target` can be `window` itself, which has no `.closest()`, so the handler checks `e.target instanceof HTMLElement` first.

### 8.3 Rendering third-party HTML safely

Problem statements are HTML from LeetCode (or Markdown from NeetCode, converted to HTML by `marked`). Rendering them with `dangerouslySetInnerHTML` unsanitized would be an **XSS hole**, and in an extension page that's worse than on a normal site, because script running there would have extension privileges (all your stored data, tab creation…).

`components/ProblemHtml.tsx` runs everything through **DOMPurify**, which parses the HTML and removes scripts, event-handler attributes, `javascript:` URLs and so on. It also forbids `<style>`/`<form>` and makes links open in a new tab with `rel="noopener noreferrer"`. Extension pages also have a strict default **Content Security Policy** that blocks inline scripts. That's a second layer, not a reason to skip the first.

`CodeBlock.tsx` uses `dangerouslySetInnerHTML` too, but its input is highlight.js output, which escapes the source and only adds `<span class="hljs-…">` wrappers.

### 8.4 Highlighting without bloat

`highlight.js/lib/core` plus a hand-picked set of languages, instead of the full build with 190+ languages. A small `ALIASES` map translates site language IDs (`python3`, `golang`, `mysql`) to highlight.js grammar names.

<details>
<summary><b>Check yourself (section 8)</b></summary>

1. Why hash routes instead of paths?
2. Why is XSS in an extension page worse than XSS on a random website?

**Answers**
1. There's no server to send arbitrary paths to `dashboard.html`. The hash never leaves the browser and doesn't trigger a page load.
2. Script there runs with the extension's permissions: storage, tabs, host access.
</details>

---

## 9. The background script

`entrypoints/background.ts` is small:

- **`updateBadge()`** computes the review queue and sets the toolbar badge text. It runs on install and startup, on every `storage.onChanged`, and every 15 minutes via `alarms` (cards become due as time passes, not only when data changes).
- **Sync:** `syncNow()` on install and startup, on a 30-minute alarm, 30 seconds after deck changes (a re-created alarm), and on `sync-now` messages from the dashboard. See [7.6](#76-github-sync).
- **`open-dashboard` messages:** content scripts can't use `browser.tabs`, so the toast's **Open** button asks the background to `tabs.create({ url: runtime.getURL('/dashboard.html') + hash })`. The handler only accepts hashes that start with `#/`. Never build URLs from unchecked message content.

---

## 10. Chrome vs Firefox

Both builds come from the same source. These are the differences, and how each is handled:

| Topic | Chrome | Firefox | What MemCode does |
|---|---|---|---|
| Background | Service worker | Event page (`background.scripts`) | WXT emits the right form per browser |
| MAIN-world content scripts | Since Chrome 111 | Since Firefox 128, **MV3 only** | MV3 for both builds (`manifestVersion: 3`) |
| Add-on identity | ID derived from key/path | Needs `browser_specific_settings.gecko.id` | `memcode@memcode` (it can't change after signing without losing data) |
| Store requirements | — | `data_collection_permissions` (Firefox 140+, Android 142+) | Declared `required: ['none']` |
| Host permissions | Granted at install | User can withhold or revoke per site | `host_permissions` declared plus the **Allow access** banner |
| Content-script `fetch` | Sent as the page | Can be sent with the **extension's** principal instead of the page's (this has varied across Firefox and manifest versions), so the page's `Origin`/`Referer` may be missing and CSRF checks can fail | `lib/page-fetch.ts` uses Firefox's `content.fetch`, which is documented to send as the page |
| Objects from the page | Plain cloned data | **Xray wrappers**: safe views of page objects | `startCapture` copies hook events with `JSON.parse(JSON.stringify(...))` |
| Reloading or updating the add-on | Content scripts aren't injected into open tabs; old copies keep running and WXT shuts them down | The old script is killed **but its DOM stays**, and the new script is injected into open tabs. The page's JS world (and the old `fetch` wrapper) survives | `startCapture` removes leftover `<memcode-capture>` elements before mounting; the page hook installs once per page (`Symbol.for('memcode.pageHook')`) |
| Installing unsigned builds | "Load unpacked", permanent | "Temporary Add-on", **removed on restart along with its storage** | Sign an unlisted build for daily use (README) |

**Xray vision, briefly.** In Firefox, when privileged code (a content script) touches an object that belongs to the page, it gets an *Xray wrapper*: it sees the object's real, native properties, but not anything page scripts may have redefined or monkey-patched. That protects extensions from pages that tamper with built-ins. The cost is that these wrappers sometimes behave unexpectedly when stored or passed on, so MemCode turns page-originated data into plain data of its own before using it.

---

## 11. Testing

### 11.1 Functional core, imperative shell

The code that's easiest to test is code that takes values and returns values. MemCode keeps the logic **pure** and pushes the messy parts (network, DOM, storage, the browser) to thin outer layers:

| Pure core (unit tested) | Imperative shell (e2e tested) |
|---|---|
| `TrafficInspector.inspect(exchange) → event` | `page-hook.content.ts` patching fetch/XHR |
| `applySolve`, `applyReview` (card in, new card out) | `upsertFromSolve`, `recordReview` (read and write storage) |
| `buildQueue(cards, settings, now)` | `getReviewQueue()` |
| `rate`, `previewIntervals` (FSRS) | — |
| `readEditorCode(storage, slug)`, which takes *any* `Storage` | `neetcode.content.tsx` passing the real `localStorage` |

Note `now` as a parameter in many functions: time is an input, so tests can freeze it instead of being flaky around midnight.

### 11.2 Unit tests (`npm test`, 55 tests)

- **Vitest** with WXT's `WxtVitest()` plugin, which wires up `@/` aliases and replaces `browser` with **`fakeBrowser`**, an in-memory implementation of `browser.storage` and friends. `fakeBrowser.reset()` before each test gives a clean slate.
- **happy-dom** provides `localStorage` and a DOM in Node for the NeetCode editor-code tests.
- **Fake GitHub:** `tests/sync.test.ts` stubs `fetch` with a small in-memory contents API (one file, sha checks, and a hook to push "from another browser" mid-sync) and fakes `Date` so edits get distinct timestamps.
- **Fixtures:** `tests/fixtures/neetcode-metadata.json` is a trimmed *real* response, so tests break if our assumptions about its shape drift.

### 11.3 End-to-end tests (`npm run e2e`)

Unit tests can't tell you whether the hook sees real requests, whether the Shadow DOM renders, or whether Firefox's quirks bite. The e2e scripts load the **built** extension into a real browser and:

- **Fake the judge** (submit/check responses) with request interception, because you can't make LeetCode accept a submission on demand without logging in.
- **Hit the real metadata APIs** (LeetCode GraphQL, NeetCode metadata), so the queries and the Firefox `content.fetch` path are checked against reality.
- Drive the full loop: Accepted → modal → rate → toast → dashboard → review → badge → export/import → popup.

How each browser is driven:

- **Chromium (`e2e/chromium.mjs`):** Playwright with its bundled Chromium plus `--load-extension`. Branded Google Chrome no longer accepts that flag, which is why Playwright's Chromium is used.
- **Firefox (`e2e/firefox.mjs`):** the hardest part of the project. Playwright's patched Firefox can't attach to extension pages. Real Firefox driven over **WebDriver BiDi** (via `puppeteer-core`) only allows it with `-remote-allow-system-access`, and even then won't *navigate to* a `moz-extension://` URL, send real keystrokes, or take screenshots there. The workarounds: let MemCode open its own dashboard tab (toast → Open), navigate inside it by setting `location.hash`, and dispatch key events in the DOM. The real-keyboard paths are covered by the Chromium run.

What none of the tests cover: a *real* logged-in submission. The judge responses are mocked from known shapes. The first real solve is the final check.

---

## 12. Smaller things worth knowing

- **`noUncheckedIndexedAccess`** (on in WXT's tsconfig): `arr[i]` and regex groups like `match[1]` are typed `T | undefined`, because an index can be out of range. That's why you'll see `match(...)?.[1]` and early returns like `if (!current) return …`. It catches real bugs, so it's worth keeping on.
- **Writing a PNG by hand** (`scripts/generate-icons.mjs`): a PNG is an 8-byte signature followed by *chunks*, each `length | type | data | CRC32`. `IHDR` holds width, height and pixel format (8-bit RGBA). `IDAT` holds the pixels: each row is prefixed with a filter byte, then the whole thing is zlib-compressed. `IEND` ends the file. The icon shapes are rounded rectangles drawn with **supersampling** (4×4 samples per pixel, averaged) for anti-aliased edges, with no image library needed.
- **Node 22 via nvm:** WXT and Vitest need Node 22 or newer. `.nvmrc` pins it; `nvm use` in the repo switches to it.
- **`unlimitedStorage` isn't infinite disk:** it only removes the extension's quota. A few thousand cards with code and descriptions is still just a few MB.

---

## 13. When something breaks: a debugging playbook

| Symptom | Where to look |
|---|---|
| No modal after an Accepted submission | Page DevTools → **Network**: find the submit and check requests and compare their URLs and JSON with the regexes and fields in `lib/hook.ts`. If LeetCode changed the shape, update `TrafficInspector` and the tests in `tests/hook.test.ts`. |
| No floating button at all | Is the content script running? DevTools → Console → the context dropdown (top-left, usually "top") lists **MemCode**, the isolated world, when it's injected. In Firefox, also check the add-on's site permissions. |
| Modal shows the slug instead of the title | The GraphQL or metadata request failed and `fallbackProblem` kicked in. Check the Network tab for `/graphql` or `/api/getProblemMetadataFunctionHttp`. |
| Badge wrong or stale | Chrome: `chrome://extensions` → MemCode → **service worker** (Inspect). Firefox: `about:debugging` → MemCode → **Inspect**. Run `await browser.storage.local.get(null)` there. |
| Want to see the raw data | In the dashboard tab's console: `await chrome.storage.local.get(null)` (or `browser.…` in Firefox). |
| A UI change doesn't show | Rebuild (`npm run build`), then click **reload** on the extension *and* refresh the site tab. Content scripts don't hot-swap into tabs that are already open. |

---

## 14. File map

```
wxt.config.ts               manifest (per browser), permissions, MV3
lib/
  types.ts                  Card, Problem, Submission, Settings, …
  srs.ts                    FSRS wrapper: newSrsState, rate, previewIntervals, (de)serialize
  storage.ts                card:<id> keys, settings, tombstones, isDue/buildQueue, updateCard, export/import
  merge.ts                  mergeDecks (pure): per-card last-writer-wins + tombstones
  github.ts                 GitHub contents API: checkRepo, getFile, putFile (sha conflicts)
  sync.ts                   syncNow: pull → merge → apply locally → push, with retries
  capture.ts                applySolve / applyReview (pure) + upsertFromSolve / recordReview
  hook.ts                   TrafficInspector (pure), message types, slug parsing
  leetcode.ts               GraphQL: problem details, latest accepted submission
  neetcode.ts               metadata API, Markdown→HTML, editor code from localStorage
  page-fetch.ts             same-origin fetch "as the page" (Firefox content.fetch)
  permissions.ts, sites.ts  host-permission check/request, site list
  format.ts                 labels: intervals, "N days ago", languages, ratings
entrypoints/
  page-hook.content.ts      MAIN world: wraps fetch/XHR, posts events
  leetcode.content.tsx      isolated: LeetCode adapter → startCapture
  neetcode.content.tsx      isolated: NeetCode adapter (+ metadata cache) → startCapture
  background.ts             badge, alarms, sync triggers, open-dashboard
  popup/                    toolbar popup
  dashboard/                App (routes), Review, Library, CardDetail, SettingsPage, SyncPanel, hooks
components/
  startCapture.tsx          message listener + Shadow DOM mount
  CaptureApp.tsx            floating button, rating modal, toast
  RatingButtons, DifficultyPill, CodeBlock, ProblemHtml, SubmissionView, NotesEditor, SiteAccessBanner
  theme.css, ui.css, capture.css
tests/                      vitest unit tests + real NeetCode fixture
e2e/                        chromium.mjs (Playwright), firefox.mjs (WebDriver BiDi)
scripts/generate-icons.mjs  hand-rolled PNG writer
```

---

## 15. Final quiz and exercises

The questions are mixed across sections on purpose. Answer each one before opening it.

1. Trace a LeetCode submission from the moment you click Submit to the toast saying "Next review in 3 days." Name every context it passes through and the mechanism each hand-off uses.
2. NeetCode's submit call goes through `XMLHttpRequest`. What would happen if the hook only wrapped `fetch`?
3. You raise desired retention from 0.90 to 0.95. Does your daily review count go up or down, and why?
4. The modal is typed into while LeetCode's editor has global shortcuts. Which two mechanisms keep your keystrokes from reaching LeetCode?
5. Why does the dashboard's review queue *not* update live from `storage.onChanged`, when the library does?
6. In Firefox, MemCode fetches problem details with `content.fetch`. What problem would a plain `fetch` risk, and why is it a non-issue in Chrome?
7. A card was last reviewed 5 days ago and has S = 5. Roughly what is R right now?
8. Which functions would you unit test if you added support for a third site, and which part would need an e2e test?

<details>
<summary><b>Answers</b></summary>

1. **MAIN world:** the hook sees `POST …/submit/` (stores the code against the submission ID), then the polled `GET …/check/` returns SUCCESS with status 10, and it calls `window.postMessage`. **Isolated world:** `startCapture` checks source and origin, copies the event, and `CaptureApp` fetches GraphQL details (same-origin, CSRF header), computes interval previews and shows the modal in the Shadow DOM. You rate, `upsertFromSolve` writes `storage.local`, and the toast shows. Meanwhile `storage.onChanged` fires in the **background** (badge) and any open **dashboard** (library refresh).
2. NeetCode submissions would never be seen. Angular's HttpClient uses XHR by default.
3. Up. Shorter intervals mean cards come due more often, and the workload rises steeply as retention approaches 1.
4. Focus moves into the modal, and `isolateEvents` stops `keydown`/`keyup`/`keypress` from propagating out of the shadow root. (React's handlers also run inside the root.)
5. The session queue is a snapshot so rating a card doesn't reshuffle the order mid-session. The library has no ordering contract with you, so live is better there.
6. A plain content-script `fetch` in Firefox can go out with the extension's principal rather than the page's, without the page's `Origin`/`Referer`, so the site's CSRF or origin checks might reject it. `content.fetch` sends it as the page. Chrome's content-script fetch already behaves like the page's.
7. About 0.9. By definition R(S, S) = 0.9.
8. Unit: a new `TrafficInspector` branch (request and response shapes → event), plus any pure parsing (slug, metadata → `Problem`). E2E: that the hook actually sees the site's real traffic and that the Shadow DOM UI mounts on the real page.
</details>

**Exercises** (roughly easiest first):

1. **Re-queue on Again.** In `Review.tsx`, when you press Again, put the card back at the end of the current session so you see it again before finishing. Where does the snapshot queue need to change?
2. **Topic drill.** Add a "Review by topic" mode: pick a tag, review those cards even if they aren't due. (Hint: the "review ahead" mode is most of the way there.)
3. **leetcode.cn support.** List every place that assumes `leetcode.com`. Start with `SITE_MATCHES`, the host check in `TrafficInspector.wants`, and the content-script `matches`.
4. **Personalized FSRS.** ts-fsrs can optimize the 21 parameters from a review history. What data would you need beyond what's in `reviewLog`? (Look at what `ReviewLog` contains in ts-fsrs.)
5. **A third site.** Using the method in 4.5, find how another practice site reports a verdict, then add a `TrafficInspector` branch, a site adapter and a content script. Write the hook test *first* with a recorded response.
