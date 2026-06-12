#!/usr/bin/env node
/**
 * measure-bands.mjs — deterministic layout measurement of a design-mockup PDF.
 *
 * Renders page 1 of the PDF at a given pixel width (via poppler's pdftoppm),
 * then scans it row-by-row to find horizontal CONTENT BANDS (rows containing
 * anything that isn't the background colour) and the GAPS between them.
 * This turns "does the live page's spacing match the mockup?" into a numeric
 * table comparison — no vision, no judgment, no tokens.
 *
 * Trailing empty space after the last band is reported separately
 * (`trailingSpace`) and excluded from `contentHeight` — mockups often have
 * unused canvas at the bottom that should NOT count as a required gap.
 *
 * Usage:
 *   node measure-bands.mjs <file.pdf> [width=1500] [minGap=20]
 *
 *   width  — pixel width to render at (compare ratios, so any width works;
 *            use the same width you tiled the PDF at for consistency)
 *   minGap — whitespace runs shorter than this merge into one band, so a
 *            paragraph's line-spacing doesn't split it into per-line bands.
 *            Raise it if text blocks split; lower it if distinct blocks merge.
 *
 * Output: JSON on stdout —
 *   { width, pageHeight, contentHeight, trailingSpace,
 *     bands: [{ i, top, bottom, height }], gaps: [{ after, top, bottom, height }] }
 *
 * Requires poppler (pdftoppm). Zero npm dependencies (parses the PPM itself).
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const [pdf, widthArg, minGapArg] = process.argv.slice(2);
if (!pdf) {
  console.error('usage: node measure-bands.mjs <file.pdf> [width=1500] [minGap=20]');
  process.exit(1);
}
const W       = +widthArg  || 1500;
const MIN_GAP = +minGapArg || 20;

// Render page 1 to a binary PPM at the target width (aspect preserved).
const tmp = mkdtempSync(join(tmpdir(), 'bands-'));
let buf;
try {
  execSync(`pdftoppm -f 1 -l 1 -scale-to-x ${W} -scale-to-y -1 "${pdf}" "${join(tmp, 'page')}"`);
  const ppm = readdirSync(tmp).find((f) => f.endsWith('.ppm'));
  if (!ppm) throw new Error('pdftoppm produced no .ppm output');
  buf = readFileSync(join(tmp, ppm));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ── Parse the P6 header ──────────────────────────────────────────────────────
let pos = 0;
const WS = new Set([0x20, 0x0a, 0x0d, 0x09]);
function token() {
  while (WS.has(buf[pos])) pos++;
  const s = pos;
  while (pos < buf.length && !WS.has(buf[pos])) pos++;
  return buf.toString('ascii', s, pos);
}
const magic = token(), w = +token(), h = +token();
token();   // maxval (assumed 255)
pos++;     // the single whitespace byte after maxval
if (magic !== 'P6') { console.error(`expected P6 PPM, got ${magic}`); process.exit(1); }

// ── Background = modal colour of a sparse pixel sample (quantised /8) ────────
const counts = new Map();
for (let i = pos; i < buf.length - 2; i += 3 * 997) {
  const k = ((buf[i] >> 3) << 10) | ((buf[i + 1] >> 3) << 5) | (buf[i + 2] >> 3);
  counts.set(k, (counts.get(k) || 0) + 1);
}
let bgKey = 0, best = -1;
for (const [k, c] of counts) if (c > best) { best = c; bgKey = k; }
const bg = [((bgKey >> 10) & 31) << 3, ((bgKey >> 5) & 31) << 3, (bgKey & 31) << 3];

// ── Row scan: a row is "content" if >0.4% of its pixels differ from bg ──────
const TH = 18;          // per-channel colour distance to count as content
const MIN_FRAC = 0.004; // content-pixel fraction for a row to be content
const rowContent = new Array(h);
for (let y = 0; y < h; y++) {
  let n = 0;
  const off = pos + y * w * 3;
  const need = w * MIN_FRAC;
  for (let x = 0; x < w; x++) {
    const o = off + x * 3;
    if (Math.abs(buf[o] - bg[0]) > TH || Math.abs(buf[o + 1] - bg[1]) > TH ||
        Math.abs(buf[o + 2] - bg[2]) > TH) {
      if (++n > need) break;
    }
  }
  rowContent[y] = n > need;
}

// ── Group content rows into bands; merge gaps shorter than MIN_GAP ──────────
const raw = [];
let start = -1;
for (let y = 0; y <= h; y++) {
  const c = y < h && rowContent[y];
  if (c && start < 0) start = y;
  if (!c && start >= 0) { raw.push({ top: start, bottom: y }); start = -1; }
}
const bands = [];
for (const b of raw) {
  const last = bands[bands.length - 1];
  if (last && b.top - last.bottom < MIN_GAP) last.bottom = b.bottom;
  else bands.push({ ...b });
}
const gaps = [];
for (let i = 0; i + 1 < bands.length; i++) {
  gaps.push({ after: i, top: bands[i].bottom, bottom: bands[i + 1].top,
              height: bands[i + 1].top - bands[i].bottom });
}
const contentHeight = bands.length ? bands[bands.length - 1].bottom : 0;

console.log(JSON.stringify({
  width: w,
  pageHeight: h,
  contentHeight,
  trailingSpace: h - contentHeight,
  bands: bands.map((b, i) => ({ i, top: b.top, bottom: b.bottom, height: b.bottom - b.top })),
  gaps,
}, null, 2));
