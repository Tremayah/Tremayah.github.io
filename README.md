# raphael.murraybrowne.com

Portfolio of Raphael Murray-Browne — product designer. Built with [Astro](https://astro.build),
deployed to GitHub Pages, served from `raphael.murraybrowne.com`.

## Architecture

A **single-page** site — the whole experience lives at `/`. A 3×2 grid of tiles fills the
viewport (no scrolling, no nav, no routing). Clicking a tile keeps it in place, pixel-dissolves
the other five with a glitchy "corruption" animation, and reveals that project's write-up —
a flowing magazine-style article whose cover photo floats inside the justified body copy — in
the freed space. A "more works" tile pages the other five tiles to a second set of projects.
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
                         opening/closing a project in place, the "more works"
                         pager, hover-typing on photo tiles, the flowing
                         article layout, the contact form's AJAX submit,
                         carousels and the lightbox.
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

Loaded from Adobe Fonts (Typekit kit `var1bvf`, linked in `LandingLayout.astro`). Active
families are set via CSS custom properties in `src/styles/global.css`: `--nav-font` and
`--body-font`. To use a new font, first add it to the kit at fonts.adobe.com, then point the
relevant variable at its CSS family name.

### Contact form

The "name" tile doubles as a message box: it posts directly to
[FormSubmit](https://formsubmit.co)'s AJAX endpoint (`https://formsubmit.co/ajax/<email>`),
so the page never navigates away — `initContactForm` in `site.ts` shows inline status text
instead. The destination address is set via `CONTACT_EMAIL` near the top of `index.astro`.

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
