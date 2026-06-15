# Design Language

A reference for this site's visual and creative DNA — for Claude/Fable to load
when building or extending project pages. Captures what's *currently* encoded
in `src/styles/global.css` and `src/scripts/site.ts`, organised into **hard
rules** (the site's signature — don't deviate without a deliberate decision)
and **heuristics** (judgment calls to make per project), followed by a full
token reference.

## Hard rules

These are load-bearing for the site's identity. A deviation should be a
deliberate creative decision, not a default.

### Palette
- `--fg: #1c1c1c` — body text / dark foreground
- `--bg: #fafafa` — page background
- `--body-color` / `--title-color: #f80d0d` — red; project body copy AND
  titles
- `--highlight: #0913ff` — blue; hover/active/interactive states
- `--accent: #5200ff` — purple; inline links only
- `#ff4d4d` — bright red; "under construction" badges/notices (distinct from
  the body/title red)
- White (`#fff`) on red/dark — badge text, nav box labels

### Typography
- `cofo-sans-pixel` (`--nav-font`) — nav labels, badges, toggle, UI chrome
- `argent-pixel-cf` (`--body-font`) — project body copy, descriptions,
  captions
- `lores-9-plus-narrow` — large display: titles, names, marquee (falls back to
  `--nav-font`)
- Convention: **UI chrome is lowercase**, **titles/names/headings are
  uppercase**
- All sizes are fluid `clamp(min, preferred, max)` — no fixed breakpoint
  jumps except the single mobile breakpoint at 680px
- Bold (700) for labels/titles/headings; regular (400) for body prose

### Hard edges
- `border-radius: 0` everywhere, no exceptions. This is a signature, not an
  oversight.
- Thin (1.5px) borders in red (`--body-color`) where borders appear at all —
  solid for active dividers (writeup bar, contact form), dashed for
  placeholders.
- Shadows are essentially unused — the one exception is the lightbox image
  (`0 8px 48px rgba(0,0,0,0.5)`).

### Motion language
Two distinct systems, both deliberately **glitchy / non-eased** — this is a
signature, not a placeholder for "real" easing later:

- **Pixel fizzle** (`pixelate()`) — a grid of cells snap (no transition)
  between opacity 0/1 in staggered buckets (`PX=22px`, `STAGGER=220ms`,
  `BUCKETS=18`). Used for load-in, the "more works" pager, and going home.
- **Radial wave** (`runStageWave`/`animateMask`) — distance-based reveal,
  linear/no easing, `SPREAD=440ms`, `HOLD=80ms`, `±25ms` jitter for a ragged
  edge. Used for opening/closing a project and swapping pages.
- Ordinary UI transitions (hover states, form focus, carousel height) DO use
  `ease`, 0.15–0.5s — only the two "scene-change" systems above are
  deliberately non-eased.
- `reduced()` (prefers-reduced-motion / user toggle) and `compact()` (≤680px)
  both collapse every animation above to its instant end-state. Always
  preserve this escape hatch for new motion.

### Imagery default: uncropped
- Default for project images is **natural aspect ratio, no cropping**
  (`width: 100%; height: auto`). This was a deliberate fix — the carousel used
  to crop to 3:2 and no longer does.
- The **one sanctioned exception** is the hero/cover image
  (`.wrap-hero-img`), which is `object-fit: cover` by design — it's sized to
  fill the top-left grid cell.
- The lightbox always uses `object-fit: contain` (never crops).

## Heuristics — judgment calls per project

### Composition grammar
Standard shape for a project writeup, top to bottom:

1. Sticky marquee bar (project name, scrolling, click = home)
2. `under construction` notice, if applicable
3. Title (large, red, uppercase, `lores-9-plus-narrow`)
4. Description — one bold lead paragraph
5. Body copy, wrapping the floated hero image (desktop) / hero stacked above
   (mobile, ≤680px)
6. Supporting media — pick from the primitives below based on what the
   material actually contains; don't force content into a primitive it
   doesn't fit.

### Layout primitives (pick based on content shape)
- `.carousel` — ≥2 related shots the reader should flick through (e.g.
  prototype iterations). Natural aspect ratio, swipeable, with dot/arrow nav.
- `.hero-pair` / `.hero-trio` — 2 or 3 images side by side, cropped to a
  shared 3:2 ratio — use when images are genuinely comparable/same subject and
  cropping to match doesn't lose information.
- `.img-grid` — 3-column square grid — for collections where uniformity
  matters more than each image's native framing.
- Standalone `<img>` — a single figure (e.g. a scale drawing, diagram) —
  natural aspect ratio, centered, `cursor: zoom-in` for the lightbox.
- `.proj-split` / `.proj-aside` — **text beside image**, the main pacing
  levers. `.proj-split` pairs one image with a paragraph in a shared row;
  `.proj-aside` is a constrained text column set beside floated media (`--r`
  variant aligns right). Use these freely to break the full-width stack — see
  Pacing & rhythm.
- `.proj-row` / `.proj-posters` — bespoke full-bleed layouts for a deliberate
  hero or section break. Full-bleed is punctuation: use it for emphasis, not as
  a default.

When source material doesn't cleanly fit any of these (process diagrams, video
stills, side-by-side comparisons with annotations), **flag it** rather than
forcing it into the nearest primitive.

### Pacing & rhythm
The page should read as a paced sequence of text and image, not a slab of prose
followed by a gallery. Generous vertical breathing room is part of the look —
lean on `--gap-lg` between movements.

- **Interleave, don't batch.** Distribute media through the writeup so a visual
  lands every screen or two of scrolling. Never stack all the prose first and
  all the images last — the most common failure.
- **Cap the prose run.** No more than ~2 short paragraphs (or a paragraph + a
  short list) between visual breaks. Keep paragraphs to ~3–4 lines at the
  body's reading width; break longer ones unless the thought genuinely can't be
  split.
- **No back-to-back media.** Two image blocks separated by one sentence read as
  a dump — put a real beat of text between them, or merge them into a single
  carousel/grid.
- **Vary the block type.** Don't repeat the same full-width stack down the page.
  Rotate the text↔image relationship: floated hero → text beside image →
  full-bleed row → carousel → grid. Changing *how* text and image relate is
  what creates rhythm.
- **Full-width solo images are punctuation, not the default.** Reserve them for
  a genuine hero or section break — a handful per page at most. Most images
  belong in a carousel, grid, or beside text.
- **Text-beside-image is the main pacing lever.** `.proj-split` / `.proj-aside`
  break the full-width stack and let prose and media share a row — use them
  freely, not "sparingly".

### Voice & copy
- **Verbatim-first**: use the project owner's own words from prior write-ups
  wherever they exist. Typo fixes only (e.g. "it's" → "its" where it's clearly
  a typo, not a style choice).
- Report back **every word that isn't verbatim** — what was changed, what was
  newly written, and why — so authorship stays clear.
- The frontmatter `description` is a short tagline in the same voice, not
  marketing copy.

### "Under construction" system
- `.uc-badge` (tiles) / `.uc-badge--small` (nav buttons) / `.uc-notice`
  (writeups) — bright red `#ff4d4d`, white text, `--nav-font`, lowercase.
- Applied to anything not yet finished. Removing it is a status change (the
  project is genuinely complete), not a styling change — treat it as a
  deliberate decision.

---

## Reference: full token inventory

### Color tokens (`:root`, `src/styles/global.css`)
| Token | Value | Use |
|---|---|---|
| `--fg` | `#1c1c1c` | body text / dark foreground |
| `--bg` | `#fafafa` | page background |
| `--body-color` | `#f80d0d` | project body copy, red accents |
| `--title-color` | `#f80d0d` | project/writeup titles (same red) |
| `--highlight` | `#0913ff` | hover/active/interactive blue |
| `--accent` | `#5200ff` | inline link color (purple) |
| `--nav-font` | `'cofo-sans-pixel', sans-serif` | UI/nav/badges |
| `--body-font` | `'argent-pixel-cf', sans-serif` | body copy |
| `--grid-gap` | `clamp(0.5rem, 1.5vw, 1.25rem)` | gap between grid tiles |
| `--grid-pad` | `clamp(0.75rem, 2vw, 1.5rem)` | padding around grid |
| `--cap` | `clamp(1.5rem, 2.3vw, 2rem)` | caption band height |
| `--marquee-h` | `clamp(2rem, 4.4vw, 3rem)` | sticky home bar height |

Other hard-coded colors: `#ff4d4d` (UC badges), `#fff` (text on red/dark),
`#f1f1f1` (placeholder bg), `rgba(28,28,28,0.55)` (carousel controls),
`rgba(0,0,0,0.90)` (lightbox overlay), `rgba(0,0,0,0.5)` (lightbox shadow).

### Typography scale
All fluid via `clamp()`:

| Element | Size |
|---|---|
| `.uc-badge--small` | `clamp(0.45rem, 0.7vw, 0.6rem)` |
| `.uc-badge` | `clamp(0.6rem, 0.95vw, 0.85rem)` |
| placeholder label | `clamp(0.75rem, 1.3vw, 1.1rem)` |
| `.tile-name` | `clamp(0.85rem, 1.4vw, 1.2rem)` |
| anim toggle | `clamp(0.55rem, 0.85vw, 0.72rem)` |
| nav box | `clamp(0.6rem, 1vw, 0.95rem)` |
| description panel | `clamp(0.6rem, 0.95vw, 0.82rem)` |
| contact email/message | `clamp(0.65rem, 1.05vw, 0.85rem)` |
| contact blurb | `clamp(0.6rem, 0.92vw, 0.82rem)` |
| send button | `clamp(0.85rem, 1.45vw, 1.2rem)` |
| `.uc-notice` | `clamp(0.7rem, 1.2vw, 0.9rem)` |
| `.project-desc` | `clamp(0.85rem, 1.5vw, 1.15rem)` |
| `.project-body` | `clamp(0.85rem, 1.5vw, 1.1rem)` |
| `.writeup-title` | `clamp(1.6rem, 3.6vw, 3.2rem)` |
| writeup marquee item | `clamp(1.1rem, 2.8vw, 2rem)` |
| contact name | `clamp(1.6rem, 4.3vw, 3.75rem)` |
| project `h2` | `0.75rem`, uppercase |
| project `h3` | `0.65rem`, uppercase |

Letter-spacing: `-0.04em` (contact name), `-0.03em` (titles/marquee),
`-0.01em` (project body). Line-height ranges from 1 (UI labels) to 1.6
(project body) to 1.7 (UC badge).

### Spacing / grid
- Landing grid: **3 columns × 2 rows**, `gap: var(--grid-gap)`,
  `padding: var(--grid-pad)`, cell height
  `calc((100dvh - 2 * var(--grid-pad) - var(--grid-gap)) / 2)`.
- Nav box (bottom-right cell): 2×2 grid, same gap, reserves `var(--cap)` at
  the bottom to align with tile captions.
- "More works" grid: 3 columns, same row height as the landing grid.
- Caption band (`.tile-name`): fixed height `var(--cap)`, shared baseline
  across tiles/nav/send button.
- Writeup layout gaps: `--gap-sm: clamp(20px, 2.4vw, 36px)`,
  `--gap-lg: clamp(54px, 12vw, 240px)` (used for full-bleed breakouts).
- Single breakpoint: **680px** (mobile = `compact()`), single-column stack,
  tile heights 68vw (photo) / 52vw (placeholder) / 88vw (nav).

### Motion details
- **Pixel fizzle** (`pixelate()`): `PX=22px` cells, `STAGGER=220ms` total,
  `BUCKETS=18`, ~12ms per bucket via `setTimeout` (works in background tabs),
  no transition (snap).
- **Radial wave** (`runStageWave`/`animateMask`): `SPREAD=440ms` wavefront
  travel, `HOLD=80ms` ring width, `JITTER=±25ms`, `BIN=16ms` bucketing,
  distance-normalized timing, linear/no easing, driven by
  `requestAnimationFrame`.
- Ordinary transitions: hover/focus/carousel-height etc. use `ease`,
  0.15–0.5s.
- Keyframes: marquee scroll (`26s linear infinite`), send-button dots
  (`1.05s infinite ease-in-out`, staggered), lightbox in/out (`0.18s` /
  `0.15s ease`).
- `html.reduce-motion` collapses everything to `0.001ms`/1 iteration.
  `compact()` (≤680px) also disables the radial wave and hero float-wrap.

### Imagery rules
- Tile images (`.tile-img`): `object-fit: cover`, fills tile.
- Hero (`.wrap-hero-img`): `object-fit: cover`, floats left on desktop (sized
  to the top-left grid cell by JS), full-width stacked on mobile. **The only
  sanctioned crop.**
- Carousel: natural aspect ratio (`width: 100%; height: auto`), JS sets
  per-slide track height, `transition: height 0.3s ease`.
- `.hero-pair` / `.hero-trio`: cropped to 3:2, `object-fit: cover`.
- `.img-grid`: cropped to 1:1 (square), `object-fit: cover`.
- Lightbox: `object-fit: contain`, max `90vw`/`90dvh`, dark overlay
  `rgba(0,0,0,0.9)`.
- Image placeholders: `aspect-ratio: 3/2`, diagonal-stripe pattern, dashed red
  border.

### Composition reference (writeup shell)
- `.writeup`: fills the stage (`position: absolute; inset: 0`), `z-index: 6`,
  scrollable, `background: var(--bg)`.
- `.writeup-bar`: sticky top, `z-index: 2`, height `var(--marquee-h)`, red
  bottom border, scrolling marquee of the project name, click → home.
- `.writeup-title`: `lores-9-plus-narrow`, red, uppercase, large.
- `.project-desc`: bold lead paragraph, body font.
- `.project-body`: justified, body font, red text, `h2`/`h3` uppercase bold,
  links in `--accent` purple.
- Hero floats left, body wraps around it (desktop only — stacks on mobile).

### Z-index layers (ascending)
`auto` (grid/body) → `2` (writeup-bar) → `3` (UC badges) → `4` (per-tile pixel
overlay) → `6` (writeup) → `8` (stage pixel overlay) → `100` (writeup on
mobile) → `200` (lightbox).

### Other conventions
- `box-sizing: border-box`, `margin: 0; padding: 0` reset globally.
- `min-width: 0; min-height: 0` on flex/grid children to prevent overflow.
- Cursors: `pointer` (interactive), `default` (placeholders), `zoom-in`
  (images), `zoom-out` (lightbox).
- `overflow-x: hidden` on the page; `.stage`/`.tile` clip with
  `overflow: hidden`.
