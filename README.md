# tremayah.com

Portfolio of Raphael Murray-Browne — product designer. Built with [Astro](https://astro.build)
and deployed to GitHub Pages. **Live at <https://tremayah.com/>** — the custom domain is set in
`public/CNAME` with DNS pointed at GitHub Pages and HTTPS enforced; `tremayah.github.io`
redirects there too.

## Architecture

A **single-page** site — the whole experience lives at `/`. A 3×2 grid of tiles fills the
viewport, with no nav or routing.

- **Cell 0** is the contact card; **cells 1–4** are project tiles; **cell 5** is a 2×2 **nav
  box** that persists across views: an *animations on/off* toggle and a *description panel* in
  the top-left, then **personal projects**, **cv** and **more works** buttons.
- **Hovering** a tile shows its blurb in the description panel.
- **Clicking a project** fizzles the whole grid with a glitchy radial "corruption" wave and
  reveals the write-up in its place. Every project opens to the **same layout**: its hero image
  lands in the **top-left tile** and the copy wraps around it, with a sticky scrolling-name
  **home bar** along the top. Click the bar (or anywhere off a link/image, or press Escape) to
  fizzle back home. The dissolve-out and the write-up's fizzle-in happen at once — one motion.
- **personal projects** swaps cells 0–4 to a second set of project tiles (a radial wave from the
  button); click it again to return. **cv** opens a full-page CV the same way. **more works**
  lets the page scroll down to reveal more tiles below the fold (and lights up to show it's a
  toggle / scroll shortcut).
- An **animations** toggle (top-left of the nav box) honours `prefers-reduced-motion` and, when
  off, makes every transition instant. On narrow screens (≤ 680px) the grid becomes a
  single-column scroller and an opened project is a full-screen overlay.

### How the pieces fit together

```
src/
  layouts/
    LandingLayout.astro  The page shell: <head>, fonts, and the <body> that
                         mounts site.ts. No nav, no marquee, no router — the
                         whole site is this one page.
  pages/
    index.astro          "/" — builds the 3×2 tile grid from the `cells` array
                         (each cell has a page-1 and page-2 variant) and embeds
                         every opened view's write-up, hidden. Also holds the
                         contact card and the 2×2 nav box.
  styles/
    global.css           All styling, in one place (tokens in :root).
  scripts/
    site.ts              All behaviour: the radial fizzle (`runStageWave` static
                         ring + `animateMask` reveal), opening a project with its
                         hero in the top-left (`openView` / `layoutProjectHero`),
                         the `setView` view-swap, scroll-driven "more works", the
                         hover description panel, the animations toggle, the
                         nav-label fill (`fillNavBoxes`), the contact form's AJAX
                         submit, carousels and the lightbox. A single `busy` lock
                         serialises transitions so rapid clicks can't overlap.
  content/
    projects/*.md        The project write-ups (the content itself).
  content.config.ts      Validates each project's frontmatter.
```

### Adding a project

Drop a new `.md` file into `src/content/projects/`. Frontmatter fields: `title`,
`description`, `year`, `category`, `tags`, `order` (controls position in the grid — lower
numbers first), and `cover` (the tile/article image). **Projects without a `cover` are
hidden from the landing grid** — handy for stubs that aren't ready yet.

To actually put a project on the grid, give it a slot in the `cells` array near the top of
`src/pages/index.astro` and add its id to the `writeupIds` list (only openable views + the CV
need their write-up embedded). Each cell holds a **page-1** tile and a **page-2** tile: page 1
is the landing (contact card + four projects), page 2 is the **personal projects** view
(currently placeholder tiles). The bottom-right nav cell persists across both. The extra tiles
revealed by **more works** are the `moreWorks` array, rendered into `.more-grid` below the fold.

Projects also mirror to a `Plain Text/<slug>/<slug>.txt` folder on each commit (see
`scripts/export-plain-text.js`) — Raphael drops reference images into those folders and edits
project copy in the `.txt` files; the pre-commit hook syncs those edits back into the markdown.
The format (tag lines for bespoke-layout blocks, `#` anchors for images, `+` lines to request
structural changes) is documented in the script header and in `Plain Text/_read-me-first.txt`.

- **Image galleries** inside a project's Markdown: `<div class="img-grid">` (3-up square
  crops), `<div class="hero-pair">` (2-up 3:2), or `<div class="hero-trio">`. Any image in a
  project body opens in the lightbox when clicked, and a `<div class="carousel">` of `<img>`
  tags becomes a swipeable slideshow.

### Fonts

Loaded from Adobe Fonts (Typekit kit `var1bvf`, linked in `LandingLayout.astro`). The two main
families are set via CSS custom properties in `src/styles/global.css` — `--nav-font` (tile
titles / labels) and `--body-font` (write-up + form copy); the contact name uses
`lores-9-plus-narrow` directly. To use a new font, first add it to the kit at fonts.adobe.com,
then reference its CSS family name. (Run `list_kit_fonts` / check the kit to see what's loaded.)

### Contact form

The top-left tile (page 1) is a contact card: a `lores-9-plus-narrow` name, a short blurb, and
a message box. Clicking the name or blurb jumps focus into the message field. The form posts
directly to [FormSubmit](https://formsubmit.co)'s AJAX endpoint (`https://formsubmit.co/ajax/<email>`),
so the page never navigates away. The **send button lives inside the message box and doubles as
the status display** (`initContactForm` in `site.ts`): red "send" → blue working dots → blue
"sent"/"error" → fades back to "send"/"retry". The destination address is set via
`CONTACT_EMAIL` near the top of `index.astro`. (On the *personal projects* view / page 2 this
cell becomes a project tile like the others.)

> **First send needs activation:** FormSubmit emails a one-time confirmation link to
> `CONTACT_EMAIL` the very first time the form is submitted. Until someone clicks that link,
> messages won't be delivered — so send one test message and confirm it once after going live.

## Commands

| Command           | Action                               |
| :---------------- | :----------------------------------- |
| `npm install`     | Install dependencies                 |
| `npm run dev`     | Dev server at `localhost:4321`       |
| `npm run build`   | Build to `./dist/`                   |
| `npm run preview` | Preview the production build locally |

## Deployment

Pushing to `main` runs the GitHub Actions workflow in `.github/workflows/`, which builds with
Astro and deploys `./dist/` to GitHub Pages. `public/CNAME` holds the custom domain.

> **Note:** the repo's GitHub Pages source must be set to **"GitHub Actions"** (Settings →
> Pages → Build and deployment → Source) — not "Deploy from a branch". The latter makes
> GitHub run its own Jekyll build alongside this workflow and serve *that* instead, which
> renders this README as the homepage rather than the built site.

## Older versions

Two earlier redesigns were explored and abandoned before landing on the current single-page
grid: an early "pixel girl" landing splash, and a multi-page version with per-project routes
and view transitions. A snapshot of the **pixel-girl-era single-page site** is preserved on
the `backup-single-page` branch / `v1-single-page` tag, in case anything from it is ever
worth revisiting — it predates the current grid design by several redesigns, so treat it as
historical reference rather than something to restore over `main`.
