# raphael.murraybrowne.com

Portfolio of Raphael Murray-Browne — product designer. Built with [Astro](https://astro.build),
deployed to GitHub Pages, served from `raphael.murraybrowne.com` (Cloudflare DNS).

## Architecture

A **multi-page** site. Each project, plus About and Contact, is its own real URL
(`/keycaps/`, `/about/`, …). Navigation between them uses Astro's
[`<ClientRouter />`](https://docs.astro.build/en/guides/view-transitions/), so pages swap
**without a full reload** and the browser back/forward buttons work as expected. Every
internal link is **prefetched** as it scrolls into view (see `astro.config.mjs`), so the
target page is already in memory when clicked — navigation feels instant.

### How the pieces fit together

```
src/
  layouts/
    SiteLayout.astro     The shell every page shares: <head>, the three-column
                         frame, and the persistent nav / marquee / lightbox.
  components/
    TitleNav.astro       Column 1 — the yellow list of links. Persists across
                         navigations (transition:persist) so it never re-animates.
    Marquee.astro        Column 4 — the fixed vertical marquee. Also persists, so
                         its scroll animation runs uninterrupted between pages.
    Lightbox.astro       The fullscreen image overlay.
    DevTools.astro       Dev-only font pickers + landing drag tool (see below).
  pages/
    index.astro          "/"          — the landing splash (pixel girl + name).
    about.astro          "/about/"
    contact.astro        "/contact/"
    [slug].astro         "/<project>/" — ONE page generated per markdown file.
  styles/
    global.css           All styling, in one place.
  scripts/
    site.ts              All behaviour: typing reveal, nav word-split, lightbox,
                         marquee, and the active-link / scroll handling that runs
                         on every navigation.
  content/
    projects/*.md        The project write-ups (the content itself).
  content.config.ts      Validates each project's frontmatter.
```

### Adding a project

Drop a new `.md` file into `src/content/projects/`. It automatically gets its own page
**and** its own entry in the nav — no other edits needed. Frontmatter fields:
`title`, `description`, `year`, `category`, `tags`, `order` (controls the position in the
nav; lower numbers first).

- **Image galleries** inside a project's Markdown: `<div class="img-grid">` (3-up square
  crops) or `<div class="hero-pair">` (2-up 3:2). Any image in a project body opens in the
  lightbox when clicked.

### Fonts

Loaded from Adobe Fonts (Typekit kit `var1bvf`). Active families are set via CSS custom
properties in `src/styles/global.css`: `--nav-font`, `--body-font`, `--dropcap-font`,
`--marquee-font`. To use a new font, first add it to the kit at fonts.adobe.com, then point
the relevant variable at its CSS family name.

### Dev-only tools

Under `npm run dev` only, a font tester (bottom) and a landing drag/measure tool (top)
appear. Both are gated behind `import.meta.env.DEV` and **never ship** to the production
build — they're absent from the generated HTML.

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

## Reverting to the old single-page version

The previous single-page design is frozen on the **`backup-single-page`** branch and the
**`v1-single-page`** tag. To restore it:

```bash
git checkout main
git reset --hard backup-single-page
git push --force-with-lease origin main
```
