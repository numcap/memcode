// Regenerates the README screenshots in docs/screenshots/. Loads the built extension in
// Playwright's Chromium, seeds a sample deck, and captures each screen. Problem pages are
// local stand-ins (judge and GraphQL responses are faked), so it runs offline.
//
//   npm run build && node scripts/screenshots.mjs
//
// Needs Playwright's Chromium once: npx playwright install chromium
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const EXT = path.join(ROOT, '.output/chrome-mv3');
mkdirSync(OUT, { recursive: true });

const DAY = 86_400_000;
const NOW = Date.now();

// ---------- Sample deck ----------

const desc = (...paragraphs) => paragraphs.map((p) => `<p>${p}</p>`).join('');

const PROBLEMS = [
  {
    source: 'leetcode', slug: 'two-sum', frontendId: '1', title: 'Two Sum', difficulty: 'Easy',
    tags: ['Array', 'Hash Table'],
    descriptionHtml: desc(
      'Given an array of integers <code>nums</code> and an integer <code>target</code>, return the indices of the two numbers that add up to <code>target</code>.',
      'Each input has exactly one solution, and you may not use the same element twice.',
      '<strong>Example:</strong> <code>nums = [2,7,11,15], target = 9</code> → <code>[0,1]</code>',
    ),
    notes: 'Hash map value → index. For each n, check whether target − n was already seen *before* inserting n. One pass, O(n) time, O(n) space.',
    lang: 'python3', runtime: '0 ms', memory: '18.1 MB',
    code: `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i`,
    history: [[-40, 3], [-37, 3], [-30, 4], [-12, 4]],
  },
  {
    source: 'leetcode', slug: 'longest-substring-without-repeating-characters', frontendId: '3',
    title: 'Longest Substring Without Repeating Characters', difficulty: 'Medium',
    tags: ['Hash Table', 'String', 'Sliding Window'],
    descriptionHtml: desc(
      'Given a string <code>s</code>, find the length of the longest substring that contains no repeated characters.',
      '<strong>Example:</strong> <code>s = "abcabcbb"</code> → <code>3</code> ("abc")',
    ),
    notes: 'Sliding window with last-seen index per char. On a repeat, jump `left` to max(left, last[c] + 1) — never move it backwards.',
    lang: 'python3', runtime: '11 ms', memory: '17.6 MB',
    code: `class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        last = {}
        left = best = 0
        for right, c in enumerate(s):
            if c in last and last[c] >= left:
                left = last[c] + 1
            last[c] = right
            best = max(best, right - left + 1)
        return best`,
    history: [[-21, 2], [-18, 3], [-9, 3]],
  },
  {
    source: 'leetcode', slug: 'trapping-rain-water', frontendId: '42', title: 'Trapping Rain Water', difficulty: 'Hard',
    tags: ['Array', 'Two Pointers', 'Dynamic Programming', 'Stack', 'Monotonic Stack'],
    descriptionHtml: desc(
      'Given <code>n</code> non-negative integers representing an elevation map where each bar has width 1, compute how much water it can trap after raining.',
      '<strong>Example:</strong> <code>height = [0,1,0,2,1,0,1,3,2,1,2,1]</code> → <code>6</code>',
    ),
    notes: 'Two pointers. Water above a bar = min(maxLeft, maxRight) − height. Move the side with the *smaller* max: that side\'s bound is already known.',
    lang: 'python3', runtime: '7 ms', memory: '19.2 MB',
    code: `class Solution:
    def trap(self, height: List[int]) -> int:
        l, r = 0, len(height) - 1
        max_l = max_r = water = 0
        while l < r:
            if height[l] < height[r]:
                max_l = max(max_l, height[l])
                water += max_l - height[l]
                l += 1
            else:
                max_r = max(max_r, height[r])
                water += max_r - height[r]
                r -= 1
        return water`,
    history: [[-16, 1], [-15, 2], [-11, 1], [-10, 3]],
  },
  {
    source: 'leetcode', slug: 'course-schedule', frontendId: '207', title: 'Course Schedule', difficulty: 'Medium',
    tags: ['Depth-First Search', 'Breadth-First Search', 'Graph', 'Topological Sort'],
    descriptionHtml: desc(
      'There are <code>numCourses</code> courses labeled <code>0</code> to <code>numCourses - 1</code>, and a list of prerequisite pairs <code>[a, b]</code> meaning you must take <code>b</code> before <code>a</code>.',
      'Return <code>true</code> if you can finish every course.',
    ),
    notes: 'Cycle detection in a directed graph. Kahn\'s algorithm: queue all in-degree-0 nodes, pop and decrement neighbours. Finished iff we popped every node.',
    lang: 'python3', runtime: '3 ms', memory: '18.9 MB',
    code: `class Solution:
    def canFinish(self, numCourses: int, prerequisites: List[List[int]]) -> bool:
        graph = defaultdict(list)
        indegree = [0] * numCourses
        for a, b in prerequisites:
            graph[b].append(a)
            indegree[a] += 1
        queue = deque(i for i in range(numCourses) if indegree[i] == 0)
        taken = 0
        while queue:
            node = queue.popleft()
            taken += 1
            for nxt in graph[node]:
                indegree[nxt] -= 1
                if indegree[nxt] == 0:
                    queue.append(nxt)
        return taken == numCourses`,
    history: [[-26, 3], [-22, 3], [-8, 3]],
  },
  {
    source: 'leetcode', slug: 'lru-cache', frontendId: '146', title: 'LRU Cache', difficulty: 'Medium',
    tags: ['Hash Table', 'Linked List', 'Design', 'Doubly-Linked List'],
    descriptionHtml: desc(
      'Design a data structure that follows the constraints of a Least Recently Used (LRU) cache, with <code>get</code> and <code>put</code> both running in O(1) average time.',
    ),
    notes: 'Hash map key → node + doubly linked list ordered by recency. Sentinel head/tail nodes remove every edge case. (Or: OrderedDict.move_to_end.)',
    lang: 'python3', runtime: '119 ms', memory: '77.4 MB',
    code: `class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.data = OrderedDict()

    def get(self, key: int) -> int:
        if key not in self.data:
            return -1
        self.data.move_to_end(key)
        return self.data[key]

    def put(self, key: int, value: int) -> None:
        self.data[key] = value
        self.data.move_to_end(key)
        if len(self.data) > self.cap:
            self.data.popitem(last=False)`,
    history: [[-6, 2]],
  },
  {
    source: 'leetcode', slug: 'coin-change', frontendId: '322', title: 'Coin Change', difficulty: 'Medium',
    tags: ['Array', 'Dynamic Programming', 'Breadth-First Search'],
    descriptionHtml: desc(
      'Given coin denominations <code>coins</code> and a total <code>amount</code>, return the fewest coins that make up that amount, or <code>-1</code> if it can\'t be made.',
    ),
    notes: 'Unbounded knapsack. dp[a] = min(dp[a − c] + 1). Initialise with amount + 1 as "infinity".',
    lang: 'python3', runtime: '583 ms', memory: '17.9 MB',
    code: `class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        dp = [0] + [amount + 1] * amount
        for a in range(1, amount + 1):
            for c in coins:
                if c <= a:
                    dp[a] = min(dp[a], dp[a - c] + 1)
        return dp[amount] if dp[amount] <= amount else -1`,
    history: [[-34, 3], [-31, 4], [-20, 3]],
  },
  {
    source: 'leetcode', slug: 'median-of-two-sorted-arrays', frontendId: '4', title: 'Median of Two Sorted Arrays',
    difficulty: 'Hard', tags: ['Array', 'Binary Search', 'Divide and Conquer'],
    descriptionHtml: desc(
      'Given two sorted arrays <code>nums1</code> and <code>nums2</code>, return the median of the two arrays combined, in O(log (m+n)) time.',
    ),
    notes: 'Binary search the partition of the shorter array so left halves have (m+n+1)/2 elements and maxLeft ≤ minRight on both sides.',
    lang: 'cpp', runtime: '0 ms', memory: '95.1 MB',
    code: `class Solution {
public:
    double findMedianSortedArrays(vector<int>& a, vector<int>& b) {
        if (a.size() > b.size()) swap(a, b);
        int m = a.size(), n = b.size(), lo = 0, hi = m;
        while (lo <= hi) {
            int i = (lo + hi) / 2, j = (m + n + 1) / 2 - i;
            int aL = i ? a[i-1] : INT_MIN, aR = i < m ? a[i] : INT_MAX;
            int bL = j ? b[j-1] : INT_MIN, bR = j < n ? b[j] : INT_MAX;
            if (aL <= bR && bL <= aR)
                return (m + n) % 2 ? max(aL, bL) : (max(aL, bL) + min(aR, bR)) / 2.0;
            if (aL > bR) hi = i - 1; else lo = i + 1;
        }
        return 0;
    }
};`,
    history: [[-9, 1], [-8, 2]],
  },
  {
    source: 'leetcode', slug: 'number-of-islands', frontendId: '200', title: 'Number of Islands', difficulty: 'Medium',
    tags: ['Array', 'Depth-First Search', 'Breadth-First Search', 'Union Find', 'Matrix'],
    descriptionHtml: desc(
      'Given an <code>m x n</code> grid of <code>\'1\'</code>s (land) and <code>\'0\'</code>s (water), return the number of islands.',
    ),
    notes: 'Flood fill. For each unvisited land cell: count++, then DFS/BFS sinking every connected land cell.',
    lang: 'java', runtime: '3 ms', memory: '49.8 MB',
    code: `class Solution {
    public int numIslands(char[][] grid) {
        int count = 0;
        for (int r = 0; r < grid.length; r++)
            for (int c = 0; c < grid[0].length; c++)
                if (grid[r][c] == '1') { count++; sink(grid, r, c); }
        return count;
    }

    private void sink(char[][] g, int r, int c) {
        if (r < 0 || c < 0 || r >= g.length || c >= g[0].length || g[r][c] != '1') return;
        g[r][c] = '0';
        sink(g, r + 1, c); sink(g, r - 1, c); sink(g, r, c + 1); sink(g, r, c - 1);
    }
}`,
    history: [[-50, 3], [-46, 4], [-35, 4]],
  },
  {
    source: 'neetcode', slug: 'is-anagram', title: 'Valid Anagram', difficulty: 'Easy',
    tags: ['Hash Table', 'String', 'Sorting'],
    descriptionHtml: desc(
      'Given two strings <code>s</code> and <code>t</code>, return <code>true</code> if they contain exactly the same characters with the same counts.',
    ),
    notes: 'Counter(s) == Counter(t). Early exit when lengths differ.',
    lang: 'python', runtime: '41 ms', memory: '13.3 MB',
    code: `class Solution:
    def isAnagram(self, s: str, t: str) -> bool:
        return len(s) == len(t) and Counter(s) == Counter(t)`,
    history: [[-60, 4], [-52, 4]],
  },
  {
    source: 'neetcode', slug: 'top-k-elements-in-list', title: 'Top K Frequent Elements', difficulty: 'Medium',
    tags: ['Array', 'Hash Table', 'Heap (Priority Queue)', 'Bucket Sort'],
    descriptionHtml: desc(
      'Given an integer array <code>nums</code> and an integer <code>k</code>, return the <code>k</code> most frequent elements, in any order.',
    ),
    notes: 'Bucket sort by frequency: buckets[count] = [nums]. Walk buckets from high to low until k collected. O(n).',
    lang: 'python', runtime: '52 ms', memory: '15.0 MB',
    code: `class Solution:
    def topKFrequent(self, nums: List[int], k: int) -> List[int]:
        buckets = [[] for _ in range(len(nums) + 1)]
        for n, c in Counter(nums).items():
            buckets[c].append(n)
        out = []
        for bucket in reversed(buckets):
            out.extend(bucket)
            if len(out) >= k:
                return out[:k]`,
    history: [[-14, 3], [-11, 2], [-4, 3]],
  },
  {
    source: 'leetcode', slug: 'merge-intervals', frontendId: '56', title: 'Merge Intervals', difficulty: 'Medium',
    tags: ['Array', 'Sorting'],
    descriptionHtml: desc(
      'Given an array of <code>intervals</code>, merge all overlapping intervals and return the non-overlapping intervals that cover the input.',
    ),
    notes: 'Sort by start; extend the last merged interval while next.start ≤ last.end.',
    lang: 'python3', runtime: '7 ms', memory: '21.0 MB',
    code: `class Solution:
    def merge(self, intervals: List[List[int]]) -> List[List[int]]:
        intervals.sort()
        out = [intervals[0]]
        for start, end in intervals[1:]:
            if start <= out[-1][1]:
                out[-1][1] = max(out[-1][1], end)
            else:
                out.append([start, end])
        return out`,
    history: [[-3, 3]],
  },
  {
    source: 'leetcode', slug: 'word-search-ii', frontendId: '212', title: 'Word Search II', difficulty: 'Hard',
    tags: ['Array', 'String', 'Backtracking', 'Trie', 'Matrix'],
    descriptionHtml: desc(
      'Given an <code>m x n</code> board of letters and a list of <code>words</code>, return every word that can be traced through adjacent cells without reusing a cell.',
    ),
    notes: 'Build a trie of the words, DFS from every cell walking the trie. Prune leaf nodes once a word is found.',
    lang: 'python3', runtime: '1840 ms', memory: '18.4 MB',
    code: `class Solution:
    def findWords(self, board: List[List[str]], words: List[str]) -> List[str]:
        trie = {}
        for w in words:
            node = trie
            for ch in w:
                node = node.setdefault(ch, {})
            node["$"] = w
        found = []

        def dfs(r, c, parent):
            ch = board[r][c]
            node = parent[ch]
            if "$" in node:
                found.append(node.pop("$"))
            board[r][c] = "#"
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < len(board) and 0 <= nc < len(board[0]) and board[nr][nc] in node:
                    dfs(nr, nc, node)
            board[r][c] = ch
            if not node:
                parent.pop(ch)

        for r in range(len(board)):
            for c in range(len(board[0])):
                if board[r][c] in trie:
                    dfs(r, c, trie)
        return found`,
    history: [[-5, 2], [-2, 1]],
  },
];

// Same scheduler settings as lib/srs.ts, minus fuzz so the shots are stable.
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false, maximum_interval: 365 }));
const toSrs = (c) => ({ ...c, due: c.due.getTime(), last_review: c.last_review?.getTime() });

function buildCard(p) {
  const { history, code, lang, runtime, memory, notes, ...problem } = p;
  const url = p.source === 'leetcode' ? `https://leetcode.com/problems/${p.slug}/` : `https://neetcode.io/problems/${p.slug}/question`;
  const times = history.map(([days], i) => NOW + days * DAY + i * 37 * 60_000 + 9 * 3_600_000);
  let srs = createEmptyCard(new Date(times[0]));
  const reviewLog = history.map(([, rating], i) => {
    srs = scheduler.next(srs, new Date(times[i]), rating).card;
    return { at: times[i], rating, kind: i === 0 ? 'solve' : 'review' };
  });
  return {
    ...problem,
    url,
    id: `${p.source}:${p.slug}`,
    notes,
    submissions: [{ code, lang, at: times[0], runtime, memory }],
    srs: toSrs(srs),
    reviewLog,
    createdAt: times[0],
    lastSeenAt: times.at(-1),
    updatedAt: times.at(-1),
  };
}

const deck = PROBLEMS.map(buildCard);
// Keep two problems out of the seeded deck: they're captured live below.
const seeded = deck.filter((c) => c.id !== 'leetcode:two-sum');

// ---------- Browser ----------

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'remcode-shots-')), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extUrl = (p) => `chrome-extension://${new URL(sw.url()).host}/${p}`;
const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
const settle = (page) => page.waitForTimeout(400);

// Seed the deck through an extension page.
{
  const page = await ctx.newPage();
  await page.goto(extUrl('popup.html'));
  await page.evaluate(async (cards) => {
    const api = globalThis.browser ?? globalThis.chrome;
    await api.storage.local.set(Object.fromEntries(cards.map((c) => [`card:${c.id}`, c])));
  }, seeded);
  await page.close();
}

// A stand-in for a LeetCode problem page: description on the left, editor on the right.
const twoSum = PROBLEMS[0];
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const MOCK_LEETCODE = `<!doctype html><html><head><meta charset="utf-8"><title>Two Sum - LeetCode</title><style>
  body{margin:0;background:#1a1a1a;color:#eff1f6bf;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;height:100vh;display:flex;flex-direction:column}
  header{height:48px;background:#282828;border-bottom:1px solid #333;display:flex;align-items:center;padding:0 16px;gap:16px;color:#eee;font-weight:600}
  header .logo{color:#ffa116}
  main{flex:1;display:flex;gap:8px;padding:8px}
  section{background:#262626;border-radius:8px;padding:16px 20px;flex:1;overflow:hidden}
  h1{color:#fff;font-size:22px;margin:0 0 8px}
  .easy{color:#00b8a3;background:#00b8a31f;border-radius:12px;padding:2px 10px;font-size:12px}
  code{background:#ffffff12;border-radius:4px;padding:1px 4px}
  pre{margin:0;color:#d4d4d4;font:13px/1.7 Menlo,monospace}
  .bar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}
  .bar span{background:#ffffff1a;border-radius:6px;padding:4px 12px;color:#eee}.bar .submit{background:#2cbb5d;color:#fff}
</style></head><body><header><span class="logo">LeetCode</span><span>Problems</span><span>Contest</span><span>Discuss</span></header>
<main><section><h1>1. Two Sum</h1><span class="easy">Easy</span>${twoSum.descriptionHtml}</section>
<section><div class="bar"><span>Run</span><span class="submit">Submit</span></div><pre>${escapeHtml(twoSum.code)}</pre></section></main></body></html>`;

// ---------- 1. Capture on LeetCode ----------
{
  const page = await ctx.newPage();
  await page.route('https://leetcode.com/problems/two-sum/description/', (r) => r.fulfill({ contentType: 'text/html', body: MOCK_LEETCODE }));
  await page.route('https://leetcode.com/graphql', (r) =>
    r.fulfill({
      json: {
        data: {
          question: {
            questionFrontendId: '1', title: 'Two Sum', titleSlug: 'two-sum', content: twoSum.descriptionHtml,
            difficulty: 'Easy', topicTags: twoSum.tags.map((name) => ({ name })),
          },
        },
      },
    }),
  );
  await page.route('https://leetcode.com/problems/two-sum/submit/', (r) => r.fulfill({ json: { submission_id: 1001 } }));
  await page.route('https://leetcode.com/submissions/detail/1001/check/', (r) =>
    r.fulfill({ json: { status_code: 10, lang: 'python3', status_runtime: '0 ms', status_memory: '18.1 MB', status_msg: 'Accepted', state: 'SUCCESS' } }),
  );
  await page.goto('https://leetcode.com/problems/two-sum/description/');
  await page.locator('.mc-fab').waitFor({ timeout: 15000 });
  await settle(page);
  await shot(page, 'fab', { clip: { x: 0, y: 820 - 90, width: 300, height: 90 } });

  await page.evaluate(async (code) => {
    await fetch('/problems/two-sum/submit/', { method: 'POST', body: JSON.stringify({ lang: 'python3', typed_code: code }) });
    await fetch('/submissions/detail/1001/check/');
  }, twoSum.code);
  const modal = page.locator('.mc-modal');
  await modal.locator('.mc-modal-title').waitFor({ timeout: 15000 });
  await modal.locator('textarea').first().fill(twoSum.notes);
  await modal.locator('.mc-code summary').click();
  await settle(page);
  await shot(page, 'capture-modal');

  await modal.focus();
  await page.keyboard.press('3');
  await page.locator('.mc-toast').waitFor();
  await settle(page);
  await shot(page, 'capture-toast', { clip: { x: 0, y: 820 - 160, width: 640, height: 160 } });
  await page.close();
}

// Give the captured card the same history as the rest of the deck.
{
  const page = await ctx.newPage();
  await page.goto(extUrl('popup.html'));
  await page.evaluate(async (card) => {
    const api = globalThis.browser ?? globalThis.chrome;
    await api.storage.local.set({ [`card:${card.id}`]: card });
  }, deck[0]);
  await page.close();
}

// ---------- 2. Popup ----------
for (const scheme of ['light', 'dark']) {
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width: 340, height: 480 });
  await page.goto(extUrl('popup.html'));
  await page.locator('.due-number').waitFor();
  await settle(page);
  const height = await page.evaluate(() => document.querySelector('.popup').getBoundingClientRect().height);
  await shot(page, `popup${scheme === 'dark' ? '-dark' : ''}`, { clip: { x: 0, y: 0, width: 340, height: Math.ceil(height) } });
  await page.close();
}

// ---------- 3. Dashboard ----------
// Dark first: the light pass works through the review queue, which changes the deck.
for (const scheme of ['dark', 'light']) {
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  const suffix = scheme === 'dark' ? '-dark' : '';

  await page.goto(extUrl('dashboard.html#/library'));
  await page.locator('.card-table tbody tr').first().waitFor();
  await settle(page);
  await shot(page, `library${suffix}`);

  if (scheme === 'light') {
    await page.goto(extUrl(`dashboard.html#/card/${encodeURIComponent('leetcode:trapping-rain-water')}`));
    await page.locator('.card-detail h1').waitFor();
    await settle(page);
    await shot(page, 'card-detail', { fullPage: true });
  }

  // Review: front with a recall attempt, then the revealed answer.
  await page.goto(extUrl(`dashboard.html#/review?card=${encodeURIComponent('leetcode:trapping-rain-water')}`));
  await page.locator('.review-card h1').waitFor();
  await page.locator('textarea.scratch').fill('Two pointers from both ends?\nwater[i] = min(maxL, maxR) - h[i]\nMove the side whose max is smaller.');
  await page.locator('textarea.scratch').blur();
  await settle(page);
  await shot(page, `review-front${suffix}`);
  await page.keyboard.press('Space');
  await page.locator('.answer').waitFor();
  await page.waitForTimeout(900);
  await shot(page, `review-answer${suffix}`);

  if (scheme === 'light') {
    // Work through the due queue to show the session summary.
    await page.goto(extUrl('dashboard.html#/review'));
    await page.locator('.review-card h1').waitFor();
    const n = await page.evaluate(() => Number(document.querySelector('.review-count')?.textContent?.split('/')[1]));
    const ratings = ['3', '2', '3', '4', '3', '1', '3', '3'];
    for (let i = 0; i < n; i++) {
      await page.locator('.review-card h1').waitFor();
      await page.keyboard.press('Space');
      await page.locator('.answer').waitFor();
      await page.keyboard.press(ratings[i % ratings.length]);
      await page.locator('.answer').waitFor({ state: 'detached' });
    }
    await page.locator('.empty-state h1').waitFor();
    await settle(page);
    await shot(page, 'session-complete', { clip: { x: 0, y: 0, width: 1280, height: 440 } });

    await page.goto(extUrl('dashboard.html#/settings'));
    await page.locator('.settings h1').waitFor();
    await settle(page);
    await shot(page, 'settings', { fullPage: true });
  }
  await page.close();
}

// ---------- 4. Phone width ----------
{
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(extUrl('dashboard.html#/library'));
  await page.locator('.card-table tbody tr').first().waitFor();
  await settle(page);
  await shot(page, 'library-mobile-dark');
  await page.close();
}

await ctx.close();
console.log(`Screenshots written to ${path.relative(ROOT, OUT)}/`);
