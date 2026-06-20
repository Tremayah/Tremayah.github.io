# Session plan — portfolio improvements

Branch: `portfolio-improvements` (NOT pushed; main/live untouched until merged).
Commit frequently. Do NOT stage `src/pages/lab.astro` (unrelated pre-existing work).

## A. This session's tasks
- [x] Commit already-done work (nav quad, CV page, about tile, UC cleanup, OG, topography, typo fixes)
- [x] Fix flagged text inconsistencies + wording
  - [x] exploration: "lasercut" → "laser cut" (consistent)
  - [x] progression: "smart phone" → "smartphone" (consistent)
  - [x] progression: "in tangent to" → "in tandem with"
  - [x] *Marathon* styling consistent (italic title-case both files)
- [x] Add essays + trebuchet to More Works (stub tiles, not fully filled)
- [x] Per-project URLs (deep-linkable projects, keep all animations)
  - [x] design approach decided
  - [x] implement pushState/replaceState with real paths
  - [x] cold-load deep-link boot (open view, skip wave)
  - [x] static hosting resolves deep links (prerender per project)
  - [x] verify in browser + build
- [x] Final commit of session work

## B. Exhaustive code review (only if time/tokens remain)
Write ALL findings to `.claude/CODE-REVIEW.md` BEFORE changing anything.
Then fix in priority order, committing per fix. Keep this list updated live.
- [x] Write findings file
- [x] Triage P0/P1/P2
- [x] Fix in order, commit each — applied 6 fixes (see CODE-REVIEW.md), all committed

## Notes / timings
- Start 02:13. MacBook awake ~1h (until ~03:13).
- Verify with: `npm run build` + preview server (port 4321).
- Live site = main on push (GitHub Actions). We are NOT pushing.
- STATUS: ALL COMPLETE ✅ (Section A + B done, build green, committed on branch).
