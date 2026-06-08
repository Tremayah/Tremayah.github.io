# Project notes for Claude

Raphael Murray-Browne's portfolio. Astro static site → GitHub Pages.

## Addresses (important — read this)

- **The site we build here is LIVE at <https://tremayah.github.io/>.** That is the working
  URL. (A custom domain `raphael.murraybrowne.com` is set in `public/CNAME` but its DNS isn't
  pointed yet, so use the `tremayah.github.io` URL for now.)
- **`raphaelmurraybrowne.com` is the OLD WordPress site — it's dead.** Raphael has jumped ship
  to the new site in this repo. The *only* reason to ever touch `raphaelmurraybrowne.com` is to
  scavenge **images or text** for projects (its `wp-content/uploads/...` image URLs are used as
  some project covers). Do not treat it as the live site or a thing to keep in sync.

Those are the only two addresses that exist. Don't invent others.

## What this is

A **single-page** site: one `/` route, a 3×2 grid of tiles, no nav/router. See `README.md`
for the full architecture. The three files that matter:

- `src/pages/index.astro` — builds the grid (`cells` array, two pages of tiles) + embeds each
  write-up hidden. `CONTACT_EMAIL` and the `writeupIds` list live up top.
- `src/scripts/site.ts` — all behaviour (pixel dissolve/reveal, open-in-place, "more works"
  crossfade pager, lightbox, carousels, contact form).
- `src/styles/global.css` — all styling, design tokens in `:root`.

Projects are markdown in `src/content/projects/*.md`; a pre-commit hook mirrors them to a
Plain Text folder, so committing/​deleting `.md` files prints a sync log (that's expected).

## Gotchas

- **GitHub Pages source must be "GitHub Actions"**, not "Deploy from a branch" — otherwise
  GitHub runs its own Jekyll build alongside the real workflow and serves the README as the
  homepage. (This already bit us once.)
- **FormSubmit needs a one-time activation**: the first message submitted triggers a
  confirmation email to `CONTACT_EMAIL`; only Raphael can click it. The dev preview sandbox
  also blocks outbound requests to formsubmit.co, so the form can't be end-to-end tested from
  here — verify markup/JS, not delivery.
- **Preview screenshots lag** (`preview_screenshot` often returns a stale frame). Trust
  `preview_eval` DOM measurements for correctness; use screenshots only for rough visuals.
- The Astro **dev toolbar** (dark pill, bottom-centre) is dev-only and never ships.

## Commands

`npm run dev` (→ :4321) · `npm run build` (→ ./dist) · `npm run preview`

## Safety

Force-pushing / `git reset --hard` on `main` affects the live site — never do it without
explicit confirmation. The `backup-single-page` branch / `v1-single-page` tag are an old
historical snapshot (pre-current-design), not a restore target.
