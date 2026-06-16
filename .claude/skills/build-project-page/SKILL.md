---
name: build-project-page
description: Turn raw project material — a webpage, PDF, project-report doc, or a folder of photos — into an on-brand portfolio writeup page, following the site's design language (DESIGN.md). Covers ingest → verbatim-first copy extraction → layout/composition decisions → photo prep → writing the content .md and wiring it into the site → build + preview verification → an accountability report of what is Raphael's words vs. generated. Use when the user wants to build (or rebuild) a project page from source material. Takes a slug + a source (URL, file path, or images dir).
---

# build-project-page — source material → an on-brand project page

Turn whatever Raphael has for a project (an old webpage, a PDF report, a doc, a
folder of photos) into a finished writeup that looks like it belongs on this
site and **reads in his own words**.

**Philosophy: his words, the site's grammar, your accountability.** Three
non-negotiables run through every phase:

1. **Verbatim-first copy.** Use Raphael's existing words wherever they exist.
   Typo fixes only. Every word that isn't his — report it.
2. **The design language is law.** `DESIGN.md` (repo root) is the contract:
   palette, type, motion, the uncropped-by-default rule, the layout primitives,
   the voice. Read it before composing. Don't invent a new visual treatment
   when a primitive fits; when none fits, *flag it* — don't improvise silently.
3. **Compose the structure, don't guess the placement.** Where a new project
   lives on the site (which tile, which view) is a layout decision that's
   Raphael's to make, not yours to assume.

## Inputs

- **slug** — kebab-case, e.g. `living-lamp`. Becomes
  `src/content/projects/<slug>.md` and the `data-open` id.
- **source** — one (or several) of: a URL (his old site
  `raphaelmurraybrowne.com`), a PDF/doc path, or a directory of photos. Read
  *every* source given before composing.
- If the slug or source is missing, ask before doing anything.

## Trust these (repo facts — getting them wrong corrupts a page or the live site)

- **`.md` is yours to author; `.txt` is his to edit.** Prose round-trips
  through `…/Portfolio Website (git)/Plain Text/<slug>/<slug>.txt` via
  `scripts/export-plain-text.js`. **The tag/anchor SEQUENCE is the contract** —
  the export *rejects* structural edits made in the txt and flags them in
  `.pending-review`. So **new structure (image blocks, layout containers) is
  defined by editing the `.md`**; after the page exists, run the exporter once
  to generate the canonical `.txt` for his future prose edits. Never overwrite a
  `.txt` he may be mid-edit on — for a brand-new slug there is none, so you're
  clear; for a rebuild, check `.txt` mtime / ask first.
- **The landing 3×2 grid is full** (contact + exploration, keycaps,
  progression, table-tennis-bat + the nav box). There is **no free landing
  cell.** A new project therefore goes into the *personal projects* view
  (page-2 placeholders) or *more works* — or it displaces a landing tile. That
  placement is Raphael's call (see Phase 5). Don't auto-place.
- **A page only opens when three things line up:** (a) `src/content/projects/<slug>.md`
  exists, (b) `<slug>` is in the `writeupIds` array in `src/pages/index.astro`,
  and (c) a real openable element carries `data-open="<slug>"` (a
  `tile--photo`, not an inert `tile--placeholder`). All three or it's dead.
- **Uncropped is the default; the hero is the one exception.** Per DESIGN.md:
  body images keep their natural aspect ratio. `object-fit: cover` is sanctioned
  *only* for the hero/cover image (it's sized to fill the top-left cell). How the
  copy meets the hero depends on the page archetype (see Phase 3):
  - **Flow page** (no `## headings`): copy *wraps* the hero, filling the space
    beside **and** below it — there must be **no blank gap** beside the hero.
    (A standing rule Raphael has corrected before.)
  - **Article page** (has `## headings`): the lead paragraph runs as a clean
    **column** beside the hero and the next block clears below it — a modest gap
    beside the *lower* hero is the intended look, not a bug to "fill". This is
    automatic via `.project-body:has(> h2)`; don't add classes or un-clear it.
- **The build can't break the site from here.** This skill only writes a
  content `.md`, edits `index.astro`, and adds image files — all caught by
  `npm run build`. It never touches deploy config. But **committing/pushing is
  always Raphael's call** — pushing changes the live site (tremayah.com).

## Phase 1 — Ingest (read everything, regardless of format)

- **Webpage:** `WebFetch` the URL. This is the proven path. (See Phase 2 for the
  two-pass verbatim trick.)
- **PDF / tall design mockup:** don't read it whole — it gets downscaled and
  blurs. Slice it first with the **pdf-tiles** skill
  (`sh .claude/skills/pdf-tiles/tile.sh <file.pdf>`), then Read the strips. For
  long PDFs of pure text, `Read` with a `pages` range also works.
- **.docx / .pages:** convert first — `pandoc <file> -t markdown` (or export to
  PDF). Flag if the tool isn't present rather than guessing the content.
- **Photos:** list the directory; record each file's pixel dimensions with
  `sips -g pixelWidth -g pixelHeight <img>` (drives the aspect-ratio /
  grouping decisions in Phase 3 & 4).

Note which source is authoritative for *copy* (usually the old webpage / report)
vs. for *images* (usually the photo folder).

## Phase 2 — Extract copy (verbatim-first, two passes)

1. First `WebFetch`/Read pass: general extraction — understand the project, its
   sections, the order.
2. **Second pass, strict:** ask explicitly for "the raw body paragraphs,
   word-for-word, preserving original spelling and punctuation exactly." This
   separates *his* prose from any summary the model would otherwise produce.
3. Assemble the copy from his words. Allowed edits: clear typos (e.g.
   `it's`→`its`), an obviously dropped word. **Not** allowed: rephrasing,
   "improving," shortening for flow, inventing a tagline.
4. Keep a running list of every deviation — every fixed typo, every word you
   had to write because his source genuinely lacked it (e.g. image alt text,
   which is usually not in his prose). This list is the Phase 7 report.

The frontmatter `description` is a short tagline **in his voice** — pull it from
his own words (a heading, a pull-quote) if at all possible; if you must write
one, flag it as yours.

## Phase 3 — Map to the site's grammar (read DESIGN.md first)

Read `DESIGN.md`. Then decide the page's structure from what the material
*actually contains* — never force content into a primitive it doesn't fit.

- **Pick the archetype first** (it changes how the hero and headings behave):
  - **Article page** — the writeup has natural sections, so it gets `## headings`.
    Headings auto-render as red-box chips, the lead paragraph auto-runs as a
    column beside the hero, and each heading auto-hugs the block after it. You
    write plain `## Heading` lines; the CSS (`:has(> h2)`) does the rest. This is
    the default for a project with a real narrative. **Living Lamp and Smart
    Jewellery are the reference article pages — match their shape.**
  - **Flow page** — a short piece with no real sections (table-tennis-bat,
    keycaps). No headings; copy wraps the hero and flows as one piece.
- **Hero:** the `cover` frontmatter image. Strongest single shot. On an article
  page the lead paragraph sits beside it as a column (don't fight the small gap
  beside the lower hero); on a flow page copy wraps it with no blank gap.
- **Choosing image blocks** (the `.txt` tag in brackets — Phase 5 writes the
  matching HTML, the exporter reads these tags back):
  - 2+ related shots to flick through (iterations, angles) → **`carousel`**
    (natural ratio, uncropped — the default). **If the set is portrait/tall it
    will dominate at full width — put it *beside text* instead:** a
    `<figure class="proj-media proj-media--carousel"><div class="carousel">…</div></figure>`
    inside a `.proj-row` (compact slider one side, a paragraph the other). This
    is the "make the carousel much smaller, on the left with a paragraph on the
    right" pattern — Living Lamp's hinge/snapped-tap row is the reference.
  - 2 / 3 directly comparable shots, same subject, where matching crops *helps* →
    **`hero pair`** / **`hero trio`** (cropped to a shared ratio).
  - a uniform set where regularity beats native framing → **`img-grid`** (square).
  - a single figure (scale drawing, diagram) → a standalone `<img>`.
  - bespoke full-bleed moments (`proj-full`, `proj-row`/`ROW`, `proj-split`/`SPLIT`,
    `proj-posters`) → only when the material clearly calls for them; used
    sparingly. `keycaps`/`exploration` are the "feature" layout reference.
- **Section headings** (`## …`) render as red-box / white-text chips and hug the
  block they introduce — so introduce a `.proj-row`/`.proj-full`/carousel
  *directly* after its heading; don't insert a filler paragraph to "fix" spacing
  (the gap is already handled), and don't hand-tune margins.
- **Prose containers** that carry text and a position: `[CLEAR]` (starts below
  the hero), `[ASIDE LEFT]`/`[ASIDE RIGHT]` (narrow hugging paragraph). These
  are how copy flows around imagery past the hero.
- **Pacing (DESIGN.md):** interleave media through the page, cap prose runs at
  ~2 short paragraphs between visuals, no back-to-back media (keep a text beat
  between two rows), and vary the text↔image relationship down the page.
- When the material wants something no primitive covers (annotated comparisons,
  video stills, a process diagram) — **stop and flag it for Raphael** with the
  options, don't bodge it.

Sanity-check the plan against DESIGN.md's hard rules before writing: zero
border-radius, the palette, uncropped default, motion untouched.

## Phase 4 — Photo prep

**What's reliable today (do this):**
- **Resize / web-optimise** with `sips` (built-in): cap the long edge at a
  web-sane size, keep aspect ratio, ensure sRGB, strip bulky metadata. Match the
  format/naming already in `public/images/<slug>/`.
- **Shrink heavy renders to JPEG** — there is no `pngquant`/`optipng`/ImageMagick
  on this machine, only `sips`, and renders/photos saved as PNG balloon (1–2 MB
  at 1600px). For any image on a **solid/opaque background**, re-encode as JPEG:
  `sips --resampleWidth 1600 -s format jpeg -s formatOptions 80 <src> --out <dest>.jpg`
  — ~10–18× smaller with no visible loss (progression's two renders went
  1.2 MB → 68 KB and 2.1 MB → 220 KB). **Check transparency first** (JPEG has no
  alpha — keep PNG if the image needs it). On a format change, repoint the `.md`
  `src` and delete the orphaned PNG (Raphael's call, per his rm rule).
- **Aspect-ratio decisions:** use the `sips` dimensions from Phase 1 to choose
  carousel vs. crop-to-match (a portrait shot in a 3:2 `hero-pair` will crop
  badly — prefer the carousel for mixed ratios; this is the exact issue the
  carousel fix in commit `1628e52` solved).
- Place files in `public/images/<slug>/`; reference them with absolute
  `/images/<slug>/…` paths (as the other projects do).

**The "match the site's vibe" grade — NOT yet defined, treat as calibration:**
- The site's *chrome* is glitchy-pixel/hard-edged, but its existing **photos are
  untreated product shots** (see table-tennis-bat). There is no house grade yet,
  so **don't invent one** and apply it silently.
- A real grading pipeline (curves/saturation/cast, consistent ICC) needs
  **ImageMagick or Python+Pillow — neither is installed.** Installing is a
  Raphael-approved setup step, not something to assume.
- **Calibration protocol when he wants a grade:** sample 2–3 photos already on
  the live site → propose a small, named preset (a script in this skill's
  folder + a `preset.json`) → apply to a couple of real photos → show him →
  iterate. Derive it from *his* current photos so the starting point is his
  vibe, not a guess. Until calibrated, ship photos resized-and-clean, ungraded,
  and say so.

## Phase 5 — Assemble & wire in

1. **Write `src/content/projects/<slug>.md`:** frontmatter
   (`title`, `description`, `year`, `category`, `tags`, `order`, `cover`) +
   body. Match the HTML structure of an existing page of the same archetype:
   - **Article page** (sectioned, the usual case) → **`living-lamp.md`** /
     `progression.md`: `## headings` between movements, the lead paragraph plain
     (it auto-columns beside the hero), a `proj-media--carousel` row for a
     portrait set, `proj-row`/`proj-row--rev` to alternate sides, `proj-full`
     for a section break.
   - **Flow page** (no sections) → `table-tennis-bat.md` (carousel) /
     `keycaps.md` (feature layout).
   Use the real primitive classes (`carousel`, `proj-row`, `proj-media--carousel`,
   `proj-split`, `hero-pair`, …) so the exporter recognises them. Keep each
   `proj-text` a **single paragraph** (the exporter round-trips one paragraph per
   prose slot — two `<p>` in one `proj-text` would merge on re-import).
2. **Placement is Raphael's decision** — present the options (the landing grid
   is full): replace a landing tile, fill a *personal-projects* slot, or add a
   *more-works* tile. Don't choose for him.
3. **Wire it to actually open** (once he's chosen a slot): add `<slug>` to
   `writeupIds` in `src/pages/index.astro`, and make its slot a real
   `tile--photo` with `data-open="<slug>"` + `data('<slug>')` (replacing the
   inert placeholder). All three of the "trust these" conditions must hold.
4. **Generate the canonical `.txt`:** `node scripts/export-plain-text.js` so the
   page is editable through his Plain Text workflow afterwards.
5. **"Under construction":** a finished page can drop the `uc-badge`/`uc-notice`
   — but removing it is a *status* change (the project is genuinely done), so
   confirm with him; don't strip it just because copy now exists.

## Phase 6 — Verify (preview, against the hard rules)

Use the **portfolio** preview (`preview_start`, then `preview_eval`). Borrow the
known-good moves from the **format-check** skill:
- `document.documentElement.classList.add('reduce-motion')` before opening.
- Open via `document.querySelector('[data-open="<slug>"]').click()` (not
  `preview_click`); the writeup is **its own scroll container** — scroll with
  `.writeup[data-for="<slug>"].scrollTop = N`, never `window.scrollTo`.
- **Await image decode before measuring/screenshotting** — heights are garbage
  until lazy images load (set `img.loading='eager'`, await `img.decode()`).
- `npm run build` must pass.

Check against DESIGN.md's hard rules specifically: **no unintended cropping**
(every body image at its natural ratio), **no blank gap beside the hero** (copy
fills around it), zero border-radius, palette/type correct. Screenshot desktop
**and** ≤680px (mobile stacks the hero). If a design mockup PDF was provided,
hand off to the **format-check** skill for the numeric+vision fidelity pass.

## Phase 7 — Report (accountability)

Mirror the table-tennis-bat report format. State plainly:
- **Copy:** which paragraphs are his verbatim; every typo fixed; every word you
  wrote (and why — usually alt text or a tagline) so authorship is unambiguous.
- **Layout:** which primitives you chose and why; anything you flagged rather
  than improvised.
- **Photos:** what you resized/cleaned; that no grade was applied (unless a
  calibrated preset exists).
- **Open decisions** left for him: placement on the site, the
  `under construction` status, any naming inconsistency in the source, whether
  to define a photo grade.
- **Don't claim done what isn't.** Build/preview proof for what works; honest
  flags for what's deferred. Committing & pushing are his call.

## Guardrails & cost

- **Never push** — the live site is his to deploy. Never overwrite a `.txt`
  he's editing. Never apply an uninvented photo grade. Never auto-place a
  project on the site.
- **Verbatim or flagged — no third option.** If it's on the page and it's not
  his words, the report says so.
- Cheap phases (ingest, extract, assemble) are mostly WebFetch + edits. The
  spend is Phase 6 if it escalates to the format-check vision gate — only run
  that when a real mockup exists to match.
- Reuses sibling skills: **pdf-tiles** (read PDF/mockup sources crisply),
  **format-check** (verify against a design mockup). Reads **DESIGN.md** for the
  design language every run.
