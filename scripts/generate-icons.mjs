// Renders the extension icon (a "code flashcard" on an indigo tile) to PNGs
// without any image dependencies. Run: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const INDIGO = [91, 91, 214];
const WHITE = [255, 255, 255];

// Painter's-order shapes in a unit square: [x0, y0, x1, y1, radius, color, alpha].
const SHAPES = [
  [0, 0, 1, 1, 0.22, INDIGO, 1],
  [0.3, 0.16, 0.86, 0.64, 0.08, WHITE, 0.45],
  [0.14, 0.34, 0.7, 0.84, 0.08, WHITE, 1],
  [0.23, 0.46, 0.53, 0.53, 0.035, INDIGO, 1],
  [0.31, 0.585, 0.61, 0.655, 0.035, INDIGO, 1],
  [0.23, 0.71, 0.45, 0.78, 0.035, INDIGO, 1],
];

function insideRoundedRect(x, y, [x0, y0, x1, y1, r]) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size) {
  const SS = 4; // supersampling per axis
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          let col = [0, 0, 0];
          let alpha = 0;
          for (const shape of SHAPES) {
            if (!insideRoundedRect(x, y, shape)) continue;
            const [, , , , , c, sa] = shape;
            col = col.map((v, i) => v * (1 - sa) + c[i] * sa);
            alpha = alpha * (1 - sa) + sa;
          }
          r += col[0] * alpha;
          g += col[1] * alpha;
          b += col[2] * alpha;
          a += alpha;
        }
      }
      const i = (py * size + px) * 4;
      const n = SS * SS;
      rgba[i] = a ? Math.round(r / a) : 0;
      rgba[i + 1] = a ? Math.round(g / a) : 0;
      rgba[i + 2] = a ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, rgba);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

for (const size of [16, 32, 48, 96, 128]) {
  writeFileSync(new URL(`../public/icon/${size}.png`, import.meta.url), render(size));
}
console.log('Wrote public/icon/{16,32,48,96,128}.png');
