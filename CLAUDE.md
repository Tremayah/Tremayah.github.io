# Project notes for Claude

Raphael Murray-Browne's portfolio. Astro static site → GitHub Pages.

## Addresses (important — read this)

- **The site we build here is LIVE at <https://tremayah.com/>.** That's the custom domain (set
  in `public/CNAME`, DNS pointed at GitHub Pages, HTTPS enforced). `tremayah.github.io` still
  resolves and redirects to it.
- **`raphaelmurraybrowne.com` is the OLD WordPress site.** Raphael has jumped ship to the new
  site in this repo. The *only* reason to ever touch `raphaelmurraybrowne.com` is to scavenge
  **images or text** for projects (pages like `/keycaps/` still serve real write-up copy).
  Nothing in this repo references it any more — don't reintroduce hot-links to it, and don't
  treat it as the live site or something to keep in sync.

Those are the only two addresses that exist. Don't invent others.

## What this is

A **single-page app** with one canonical home (`/`) plus a deep-linkable page per
openable project at `/p/<slug>/`. A 3×2 grid of tiles fills the viewport; opening a project
swaps the URL via the History API (no real navigation — same app, write-up revealed in place).
The files that matter:

- `src/components/Landing.astro` — **the whole app**: builds the grid from the `cells` array
  (each cell has a page-1 and a page-2 variant) and embeds every openable write-up, hidden.
  Takes an optional `openId` prop → `data-open-initial` on the stage, so a deep-link boots
  straight into that view. `FORMSUBMIT_ALIAS` and `UNDER_CONSTRUCTION` live up top.
- `src/pages/index.astro` — thin wrapper: `<LandingLayout><Landing /></LandingLayout>`.
- `src/pages/p/[slug].astro` — pre-renders a real page per openable id (`getStaticPaths` over
  `src/openable.ts`), passing `openId` + the project's own title/description/OG image.
- `src/openable.ts` — single source of truth for the openable/deep-linkable ids.
- `src/scripts/site.ts` — all behaviour (see the model below); `pushAway`/`pathFor` keep the
  URL (`/` ⇄ `/p/<slug>/`) and `document.title` in step; cold deep-links open instantly.
- `src/styles/global.css` — all styling; design tokens in `:root` (`--grid-gap`, `--grid-pad`,
  `--cap` caption-band height, `--marquee-h`, colours).

## Behaviour model (current — README goes deeper)

- **Grid.** Cell 0 = the contact card. Cells 1–4 = project tiles. Cell 5 = a 2×2 **nav box**
  that persists: top-left holds an **animations on/off toggle** + a **description panel**;
  top-right + bottom-left are buttons — **personal projects**, **more works** (their labels are
  stretched to fill each box: an SVG with `preserveAspectRatio="none"`, see `fillNavBoxes`).
  Bottom-right is a **links quad** (`.nav-quad`) — its own 2×2 of small `.nav-mini` tiles:
  **Instagram**, **LinkedIn**, the **cv** page button, and one **blank** spare slot.
- **Hover** any tile → its blurb shows in the nav description panel (no typing animation).
- **Opening a project** (`openView`): the *whole* stage fizzles (radial wave) and the project's
  **hero image appears in the TOP-LEFT**, with the copy wrapping around it — the same layout
  for every project, regardless of which tile was clicked. The opened write-up carries a sticky
  **home bar** at the top (the scrolling name); click it (or anywhere off a link/image) to go
  home. **cv** opens the same way but full-page (no hero). The clicked tile does **not** persist
  any more (no "sliced title").
- **personal projects** radial-swaps cells 0–4 between page 1 (home) and page 2 (placeholder
  project tiles) via `setView`; click it again to come back.
- **more works** = the homepage scrolls; scrolling down reveals extra `.more-grid` tiles below
  and lights the "more works" button. The button is a shortcut (scroll down / back to top).
- **Robustness:** one `busy` lock serialises every transition (open/close/swap) so spam-clicking
  can't overlap waves. Animations honour `prefers-reduced-motion` and the toggle
  (`html.reduce-motion` → instant, no wave). On narrow screens (`≤680px`) the grid becomes a
  single-column scroller and an opened view is a full-screen overlay (`compact()` → instant).
- **The fizzle**: `runStageWave` (a stage-level pixel "static" ring) + `animateMask` (a radial
  mask that reveals/hides the write-up under the ring). Tunables: `SPREAD`, `HOLD`, `JITTER`,
  `PX` (pixel-cell size).

Projects are markdown in `src/content/projects/*.md` — the **source of truth**; the site builds
from them. A **pre-commit hook** mirrors each to `…/Plain Text/<slug>/<slug>.txt` (one folder
per project, so images can be dropped alongside) via `scripts/export-plain-text.js`. The `.txt`
is a **plain-prose mirror** (a one-line tagline, `## headings`, body paragraphs, and read-only
`[ note ]` lines marking where a photo/carousel sits) — **no strict syntax**. Raphael edits the
words; there is **no auto-import**. The export protects any `.txt` edited since its last export
(left untouched, listed in `…/Plain Text/_PENDING-EDITS.txt`); on the next push Claude folds
those word changes into the `.md` by hand, then runs `export-plain-text.js --force` to refresh
the mirror. See `…/Plain Text/_read-me-first.txt` (for Raphael) and the `build-project-page`
skill ("Applying his plain-text edits"). Committing prints an export log — expected. The hook
only ever removes a derived `.txt`, never a project folder.

## Gotchas

- **GitHub Pages source must be "GitHub Actions"**, not "Deploy from a branch" — otherwise
  GitHub runs its own Jekyll build alongside the real workflow and serves the README as the
  homepage. (This already bit us once.)
- **FormSubmit needs a one-time activation**: the first message submitted triggers a
  confirmation email to `CONTACT_EMAIL`; only Raphael can click it. The dev sandbox may also
  block outbound requests to formsubmit.co, so verify markup/JS, not delivery.
- **The preview throttles `requestAnimationFrame` and smooth-scroll**, so animation *timing*
  and rAF-driven state can't be observed there — assert on `preview_eval` DOM measurements and
  end states, not on mid-animation reads. `preview_screenshot` can also return a stale frame.
- The Astro **dev toolbar** (dark pill, bottom-centre) is dev-only and never ships.

## Reading PDF mockups / design specs

Raphael may send project-page designs as a tall PDF. **Don't view a tall page directly** — it's
downscaled to a fixed budget and fine text/measurements blur. Use the **`pdf-tiles`** skill
(`.claude/skills/pdf-tiles/`): `sh .claude/skills/pdf-tiles/tile.sh <file.pdf>`, then Read the
`pdf-tiles/tile_*.png` strips in order (each rendered at the display width, so it stays sharp;
`pdf-tiles/tiles.txt` lists the y-range of each). Needs poppler (`pdftoppm`), already installed.

## Commands

`npm run dev` (→ :4321) · `npm run build` (→ ./dist) · `npm run preview`

## Safety

Force-pushing / `git reset --hard` on `main` affects the live site — never do it without
explicit confirmation. The `backup-single-page` branch / `v1-single-page` tag are an old
historical snapshot (pre-current-design), not a restore target.
