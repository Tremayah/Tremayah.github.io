# raphael.murraybrowne.com

Portfolio of Raphael Murray-Browne — product designer. Built with [Astro](https://astro.build),
deployed to GitHub Pages, served from `raphael.murraybrowne.com` (Cloudflare DNS).

## Architecture

A single-page site. Everything lives in **`src/pages/index.astro`** — markup, scoped
styles, and the client script (panel toggling, typing reveal, lightbox, marquee).

- **Projects** are Markdown files in `src/content/projects/`, validated by the schema in
  `src/content.config.ts`. Frontmatter: `title`, `description`, `year`, `category`,
  `tags`, `order` (controls nav order). Drop a new `.md` in to add a project.
- **Fonts** load from Adobe Fonts (Typekit kit `var1bvf`). Active families are set via CSS
  custom properties: `--nav-font`, `--body-font`, `--dropcap-font`, `--marquee-font`.
- **Image galleries**: use `<div class="img-grid">` (3-up square crops) or
  `<div class="hero-pair">` (2-up 3:2) inside Markdown.

### Dev-only font tester

Under `npm run dev`, four text inputs appear bottom-left for live-swapping each font family.
They are gated behind `import.meta.env.DEV`, so they never ship to the production build.

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
