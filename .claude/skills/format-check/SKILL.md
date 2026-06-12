---
name: format-check
description: Check a portfolio page against its reference design PDF and fix the differences — spacing measured numerically (DOM vs PDF pixel-bands, no vision), with two independent vision agents confirming only at the end. Use when the user wants a page (exploration, keycaps, …) verified or fixed against a design mockup PDF. Takes a page slug + a PDF path.
---

# format-check — match a live page to its design PDF

Make a portfolio page match its design mockup: same blocks, same order, same
text, and **the same spacing between blocks** — then prove it with two
independent vision checks.

**Philosophy: numbers first, vision last.** Spacing, heights, order and text are
measured *deterministically* (a bundled script measures the PDF; `preview_eval`
measures the live DOM) and compared as a table. Vision sub-agents — the
expensive, fallible part — run **only at the very end**, to confirm the few
things numbers can't see (right image in right slot, cropping, side placement,
type hierarchy). This is ~5–10× cheaper than screenshot-led comparison and far
more precise. Phases 1–3 are mechanical; any model can orchestrate them.

## Inputs

- **page** — slug, e.g. `exploration` (opens from `[data-open="<page>"]`).
- **pdf** — absolute path to the reference mockup PDF.
If either is missing, ask before doing anything.

## Known runtime facts (learned the hard way — trust these)

- `preview_screenshot` returns an **inline image only**; it cannot be saved to
  disk, and it sometimes returns **stale frames** (a screenshot lagging behind
  the real page). Mitigation: confirm scroll position via `preview_eval` first;
  if a screenshot looks stale, nudge `scrollTop` by ±2 and re-shoot, max 2
  retries, then proceed on DOM evidence and say so. Never loop on it.
- The opened writeup is its **own scroll container**: scroll with
  `document.querySelector('.writeup[data-for="<page>"]').scrollTop = N`,
  never `window.scrollTo`. The CV opens via its nav button, not a tile.
- Always `document.documentElement.classList.add('reduce-motion')` before
  opening, and click tiles via `preview_eval` (`…click()`), not `preview_click`.
- **Any height measured before the writeup's lazy images have decoded is
  garbage** — image blocks collapse to near-zero and a real ~9700px page reads
  as ~4400px. The Phase 1.6 snippet awaits `img.decode()`; never measure
  `scrollHeight`/rects or take screenshots before it has run once. (This
  artifact once produced a bogus "live page is half the mockup's height"
  finding that survived a whole review pass.)
- PDF strips and live screenshots **never align by index** (different heights);
  align by *content*. The band tables below solve alignment numerically.
- Ignore in all comparisons: the sticky scrolling-name bar, the dev-toolbar
  pill, scrollbars, font anti-aliasing/sub-pixel rendering.
- **Trailing empty canvas at the bottom of the mockup is unused space — cut
  it.** The measurement script already excludes it (`trailingSpace`).

## Tolerances (the contract — look values up here, don't improvise)

| Measurement | Pass when | Severity if out |
| --- | --- | --- |
| Band count (after calibration) | equal | HIGH |
| Block order / which image in which slot / image side | identical | HIGH |
| Total content height ratio (live ÷ scaled mockup) | within ±8% | HIGH |
| Each inter-band gap | within ±12% (or ±10px, whichever is larger) | MEDIUM; HIGH if >40% off |
| Image-band heights | within ±5% | MEDIUM |
| Text-band heights | within ±20% (fonts render differently) | LOW |
| Text content (normalised) | identical | HIGH if missing/extra block; LOW if word-level |
| Vision gate (Phase 4) | score ≥92 per section, no HIGH discrepancy | — |

## Phase 1 — Measure both sides (deterministic, ~no tokens)

1. **Mockup geometry.** `pdfinfo "<pdf>"` → note the page size in pts (e.g.
   `1920 x 10800`). Then:
   ```sh
   node .claude/skills/format-check/measure-bands.mjs "<pdf>" 1500 20
   ```
   Save the JSON (RENDER_W=1500). Bands = content blocks, gaps = spacing,
   `contentHeight` already excludes the unused trailing space.
2. **Mockup text.** `pdftotext "<pdf>" - | tr -s ' \n' ' '` → normalised string.
3. **Tile the mockup for Phase 4** (don't re-tile later):
   ```sh
   sh .claude/skills/pdf-tiles/tile.sh "<pdf>" 1500 900 pdf-tiles/spec
   ```
4. **Open the live page at the design's native width.**
   `preview_start` (name: portfolio) → `preview_resize` to
   width = the PDF's pt width (cap at 1920), height 900 → then via `preview_eval`:
   `document.documentElement.classList.add('reduce-motion');
    document.querySelector('[data-open="<page>"]').click();`
5. **Compute the scale factor** `S = viewport_width / RENDER_W`
   (e.g. 1920/1500 = 1.28). Every mockup pixel number × S before comparing.
6. **Live band table** — run this with `preview_eval` (substitute PAGE and
   MERGE = round(20 × S)). It is async and idempotent (safe to re-run), and it
   **must await image decode** — measuring straight after `.click()` reads
   collapsed, images-not-yet-loaded layout and every number comes out wrong:
   ```js
   (async () => {
     document.documentElement.classList.add('reduce-motion');
     const w = document.querySelector('.writeup[data-for="PAGE"]');
     if (w.hidden) document.querySelector('[data-open="PAGE"]').click();
     const imgs = [...w.querySelectorAll('img')];
     imgs.forEach((i) => { i.loading = 'eager'; });
     await Promise.all(imgs.map((i) => i.decode ? i.decode().catch(() => {}) : 0));
     await new Promise((r) => setTimeout(r, 60)); // let layout settle
     const base = w.getBoundingClientRect().top - w.scrollTop;
     const els = [
       ...w.querySelectorAll('.writeup-inner > .wrap-hero, .writeup-inner > .writeup-title, .writeup-inner > .project-desc'),
       ...w.querySelectorAll('.project-body > *'),
     ];
     const rects = els
       .filter((el) => el.offsetParent !== null)
       .map((el) => { const r = el.getBoundingClientRect(); return {
         cls: String(el.className).slice(0, 40),
         top: Math.round(r.top - base), bottom: Math.round(r.bottom - base),
         img: el.querySelector('img')?.getAttribute('src') ?? null,
         text: (el.textContent || '').trim().slice(0, 50) }; })
       .filter((r) => r.bottom > r.top)
       .sort((a, b) => a.top - b.top);
     const bands = [];
     for (const r of rects) {
       const last = bands[bands.length - 1];
       if (last && r.top - last.bottom < MERGE) {
         last.bottom = Math.max(last.bottom, r.bottom);
         last.members.push(r.cls || r.img || r.text);
       } else bands.push({ top: r.top, bottom: r.bottom, members: [r.cls || r.img || r.text], img: r.img, text: r.text });
     }
     const gaps = bands.slice(1).map((b, i) => ({ after: i, height: b.top - bands[i].bottom }));
     return { contentHeight: bands.at(-1)?.bottom ?? 0, bands, gaps, rects };
   })()
   ```
7. **Calibrate band counts.** If live and mockup band counts differ, the merge
   threshold is probably straddling paragraph spacing: re-run BOTH sides with
   minGap 48, then 64 (live MERGE always = round(minGap × S)). Use the smallest
   value where counts match.
   **If no value matches counts, don't panic and don't call it HIGH yet** —
   small text-gap rhythm often straddles any single threshold. Fall back to
   **anchor alignment**: take only the big bands (height > 300×S px — these are
   the image sections: full-bleeds, rows, split, posters) from both tables and
   pair them 1:1 in order. Anchor counts equal → compare (a) the gap between
   consecutive anchors and (b) the summed height of the small bands between
   them, using the normal tolerances; the text-cluster's internal rhythm then
   counts as one combined measurement. Anchor counts unequal → NOW it's a HIGH
   structural finding (a missing/extra image section); identify it by reading
   the one spec strip covering the unmatched band's y-range.

## Phase 2 — Numeric comparison (orchestrator only, no agents)

Build one table, mockup vs live, band by band:
- `target_gap_i = mockup_gap_i × S` vs `live_gap_i`; same for band heights and
  `contentHeight`. Classify each row with the Tolerances table.
- Diff the text: mockup `pdftotext` string vs live `rects[].text` /
  `document.querySelector('.project-body').textContent` (normalise whitespace,
  case, quotes). The mockup may itself contain typos the live copy fixed —
  word-level differences are LOW, **never** "fix" live copy to match a mockup
  typo; flag for the user instead.
- Compute the run's score:
  `ERROR = mean(|live_gap − target_gap| / target_gap) + |contentHeight_ratio − 1|`.

**All rows pass → Phase 4.** Otherwise → Phase 3 with the failing rows.

## Phase 3 — Fix loop (numeric targets, ratchet, max 4 rounds)

Track `round = 0`, `MAX_ROUNDS = 4`. Per round:
1. Record `ERROR_before`. Spawn a **fixer** (`model: sonnet`, fresh each time):
   > You are adjusting a page's spacing/layout to match numeric targets from a
   > design mockup. Edit only `src/styles/global.css` (the "Bespoke project
   > layout" section) and/or `src/content/projects/<page>.md`. Here is the
   > discrepancy table: [rows: location, current px, target px]. The layout
   > uses viewport-relative tokens — `--gap-sm: clamp(20px,2.4vw,36px)`,
   > `--gap-lg`, `--grid-pad` — measured at a [WIDTH]px viewport; hit the
   > targets by retuning these tokens or the per-section rules that consume
   > them, not with one-off magic numbers, so the page stays responsive. Keep
   > every selector scoped to the page's classes (`.project-body .proj-…`);
   > this stylesheet is shared by other pages. After editing run `npm run
   > build` (must pass). Report each selector changed, then stop. Do not
   > commit, push, or loop.
2. Rebuild; re-run the Phase 1.6 eval (and 1.7 calibration if structure
   changed); recompute `ERROR_after`.
3. **Ratchet:** keep the fix only if `ERROR_after < ERROR_before` AND the build
   is green AND a spot-check eval of another open project (e.g. keycaps first
   screen) shows no regression AND a quick eval at 680px width still shows the
   mobile stack sane. Otherwise `git checkout -- <files>` and record why.
4. `round += 1`. All rows pass → Phase 4. `round == MAX_ROUNDS` → Phase 5
   honestly (best state + remaining table).

## Phase 4 — Vision confirmation gate (the only expensive part)

Runs **once numbers fully pass** — never during the fix loop. Spawn **two fresh
agents back-to-back on the same frozen build** (no fix in between, no shared
notes): **Confirmation A** `model: opus`, **Confirmation B** `model: sonnet`
(different family on purpose — decorrelates blind spots). Identical prompt:

> You are an independent design-QA reviewer; work at high effort. Compare the
> live page to its design mockup and score fidelity. Do NOT edit files.
> TOOLING: a dev preview is running, serverId `[SERVERID]`; the page
> `[PAGE]` is already open at [WIDTH]px with animations off. Screenshot with
> `mcp__Claude_Preview__preview_screenshot`; scroll first via
> `mcp__Claude_Preview__preview_eval`:
> `document.querySelector('.writeup[data-for="[PAGE]"]').scrollTop = N`
> (content is [LIVE_H]px tall; step N by ~850). Screenshots may return stale
> frames: verify scrollTop via eval before each shot; if a shot looks stale,
> nudge scrollTop ±2 and re-shoot (max 2 tries), then rely on DOM facts and
> lower your confidence, saying so. If you lack the `mcp__Claude_Preview__*`
> tools entirely, STOP and report that as your only finding.
> The mockup is sliced at `pdf-tiles/spec/tile_NN.png` (Read them;
> `tiles.txt` has y-ranges). The mockup page is taller than its content —
> ignore empty space after the last content block. Strips don't align with
> your screenshots by index — match sections by content.
> Numeric spacing has ALREADY been verified — do not re-measure gaps. Check
> only what numbers can't: each image is the RIGHT image in the right slot,
> correct side (left/right), full-bleed vs inset vs split treatment, cropping
> /aspect, type hierarchy (sizes, weights, caps, colour roles), and any block
> that looks structurally different from the mockup. Ignore: sticky name bar,
> dev-toolbar pill, anti-aliasing. Per section return `{score 0-100,
> pass|fail, discrepancies:[{severity, what, where}]}`; overall PASS only if
> every section ≥92 with no high-severity item. Return only the structured
> report.

- **Both PASS → done.** → Phase 5.
- **Either FAILs →** feed its discrepancy list to Phase 3 (counts toward
  `MAX_ROUNDS`); after the next kept fix, re-run the whole gate fresh.

## Phase 5 — Report

- Verdict: confirmed (2 independent passes) / best-effort (cap hit) — never
  claim a match you didn't get. Include: the final numeric table (target vs
  live), vision findings, fixes kept/reverted, and won't-fix notes (e.g.
  mockup typos, print-only effects).
- Clean up: `preview_stop`; `rm -rf pdf-tiles` (it's git-ignored scratch).
- Committing/pushing is the **user's** call. After they push and GitHub Pages
  finishes deploying (minutes), optionally run ONE Confirmation-style pass
  against `https://tremayah.com/` to catch build/deploy drift.

## Guardrails & cost

- Phases 1–3 are nearly token-free (scripts + evals — typically <30k total).
  The gate is the spend (~100–200k for both agents); it fires at most
  once per kept fix and only after numbers pass. One full verifier-led
  screenshot pass measured ~99k tokens/14min — that is what this design avoids.
- Never auto-push. Never un-scope a selector. Never "fix" live copy to match a
  mockup typo. The ratchet means a kept fix is always a strict improvement.
- Always terminates: numbers pass + gate passes, or `MAX_ROUNDS` — then report.
