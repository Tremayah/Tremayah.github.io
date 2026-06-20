# Code review — portfolio (branch: portfolio-improvements)

High-effort pass. **All findings written here BEFORE any fix.** Then fixed in
priority order, one commit per fix, ticking items as I go. If interrupted, the
unticked items below are the remaining work; nothing half-applied.

Legend: [ ] todo · [x] done · [~] deferred (reason given) · [i] info only.

## P1 — correctness / should-fix
- [x] **Stale `document.title` on in-app nav.** Deep-link pages set a per-project
  `<title>`, but History-API nav (home⇄project) never updates it, so the tab
  title goes stale (e.g. open Living Lamp, go home → title still "Living Lamp…").
  Fix: set `document.title` in `openView` (project/CV name) and reset to the site
  title on `fizzleHome`. Files: `src/scripts/site.ts`. — done (helper `setDocTitle`).
- [x] **Stale docs in CLAUDE.md.** "Three files that matter" still says
  `src/pages/index.astro` builds the grid — that logic moved to
  `src/components/Landing.astro`; index.astro is now a thin wrapper, plus the new
  `/p/[slug]` route + `src/openable.ts`. Fix: update CLAUDE.md. — done.

## P2 — SEO / discoverability (matters for the job hunt)
- [x] **No sitemap.** New `/p/<slug>/` pages won't be discovered fast. Added a
  hand-written `public/sitemap.xml` (home + 7 project pages). — done.
- [x] **No robots.txt.** Added `public/robots.txt` (allow all + sitemap ref). — done.
- [x] **No `theme-color`.** Added meta (brand red) for mobile browser chrome. — done.

## P2 — accessibility
- [~] **Focus not moved into the opened write-up.** Opening a project leaves
  keyboard focus on the now-hidden tile button. Deferred: a safe fix needs
  focus-return-on-close tracking too; higher risk than its value this session,
  and Escape-to-close already works. Recommend as a follow-up.
- [i] **Red `#f80d0d` body text on `#fafafa` ≈ 3.9:1** — below WCAG AA (4.5:1) for
  small text. This is a deliberate brand choice (DESIGN.md); not changing.

## P3 — info / no action
- [i] **Writeup text is embedded on every page** (home + each /p page) → duplicate
  text across URLs. Inherent to the instant-open SPA design; self-referential
  canonicals are in place. Acceptable.
- [i] **`src/pages/lab.astro`** is an experiments page (noindex) that still builds
  to `/lab/`. It's marked "delete when done" and has uncommitted local edits from
  a prior session — left untouched (not this session's work, not mine to delete).
- [i] **CV page PNGs** ~0.36–0.68 MB each; fine. Could be JPEG to shave KBs, but
  text stays crisper as PNG. No change.

## Verify after fixes
- `npm run build` green; `/p/*` pages present.
- Deep-link still boots; title updates on nav; sitemap/robots/theme-color in output.
