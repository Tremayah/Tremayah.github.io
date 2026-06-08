# raphael.murraybrowne.com

Portfolio of Raphael Murray-Browne — product designer. Built with [Astro](https://astro.build)
and deployed to GitHub Pages. **Live at <https://tremayah.github.io/>**; the custom domain
`raphael.murraybrowne.com` is configured (`public/CNAME`) but its DNS isn't pointed yet, so
`tremayah.github.io` is the working URL for now.

## Architecture

A **single-page** site — the whole experience lives at `/`. A 3×2 grid of tiles fills the
viewport (no scrolling, no nav, no routing). Clicking a tile keeps it **exactly where it is** —
its hero image and sliced title stay put as the anchor — while every other tile pixel-dissolves
to the background with a glitchy "corruption" animation and the project's write-up fizzles into
the largest grid-aligned rectangle the freed cells leave behind. The dissolve-out and the
write-up's fizzle-in run at once, so it reads as a single motion. A "more works" tile crossfades
the other five cells (the contact card included) to a second set of projects, cell by cell.
Clicking anywhere (or pressing Escape) closes the open project and reverses the animation.

### How the pieces fit together

```
src/
  layouts/
    LandingLayout.astro  The page shell: <head>, fonts, and the <body> that
                         mounts site.ts. No nav, no marquee, no router — the
                         whole site is this one page.
  pages/
    index.astro          "/" — builds the 3×2 tile grid from the project
                         collection and embeds every write-up (hidden) ready
                         to be revealed in place. Also holds the contact card
                         markup (the old "name" tile).
  styles/
    global.css           All styling, in one place.
  scripts/
    site.ts              All behaviour: the pixel dissolve/reveal animation,
                         opening a project in place (clicked tile persists,
                         write-up fills the freed grid rectangle — see
                         freeRectFor), the per-cell "more works" crossfade
                         pager, hover-typing on photo tiles, the contact
                         form's AJAX submit, carousels and the lightbox.
  content/
    projects/*.md        The project write-ups (the content itself).
  content.config.ts      Validates each project's frontmatter.
```

### Adding a project

Drop a new `.md` file into `src/content/projects/`. Frontmatter fields: `title`,
`description`, `year`, `category`, `tags`, `order` (controls position in the grid — lower
numbers first), and `cover` (the tile/article image). **Projects without a `cover` are
hidden from the landing grid** — handy for stubs that aren't ready yet.

To actually put a project on the grid, add its id to the `writeupIds` list near the top of
`src/pages/index.astro` and give it a slot in the `cells` array below it (each of the 6 cells
holds a "page 1" and a "page 2" tile — page 2 is what "more works" pages to).

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

The first tile (page 1, top-left) is a contact card: a `lores-9-plus-narrow` name, a short
blurb, and a message box. Clicking the name or blurb jumps focus into the message field. The
form posts directly to [FormSubmit](https://formsubmit.co)'s AJAX endpoint
(`https://formsubmit.co/ajax/<email>`), so the page never navigates away — `initContactForm`
in `site.ts` shows inline status text instead. The destination address is set via
`CONTACT_EMAIL` near the top of `index.astro`. (On "more works" / page 2 this cell swaps to a
project like any other.)

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
