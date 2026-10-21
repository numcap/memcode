// Renders docs/logo/logo.svg to the extension icons in public/icon/, so the toolbar
// icon always matches the logo. Run: node scripts/generate-icons.mjs
//
// Needs Playwright's Chromium once: npx playwright install chromium
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 96, 128];
const svg = readFileSync(path.join(ROOT, 'docs/logo/logo.svg'), 'utf8');

// At 16px the second card and thin strokes blur together, so the smallest icon drops
// the back card and draws one bigger card with heavier code brackets.
const SMALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7676F2"/><stop offset="1" stop-color="#4646C0"/>
  </linearGradient></defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <rect x="14" y="24" width="100" height="80" rx="14" fill="#fff"/>
  <g fill="none" stroke="#4F46E5" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="M42 46 L26 64 L42 82"/><path d="M86 46 L102 64 L86 82"/><path d="M71 40 L57 88"/>
  </g>
</svg>`;

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block}</style>` +
      (size <= 16 ? SMALL_SVG : svg).replace('<svg ', `<svg width="${size}" height="${size}" `),
  );
  await page.screenshot({ path: path.join(ROOT, `public/icon/${size}.png`), omitBackground: true });
}
await browser.close();
console.log(`Wrote public/icon/{${SIZES.join(',')}}.png`);
