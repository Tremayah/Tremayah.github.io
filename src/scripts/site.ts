/* ============================================================================
   Single-page portfolio behaviour.

   The whole site is one page (index.astro): a 3×2 grid of tiles with every
   opened view's writeup embedded and hidden. This script drives:
     • the pixel fizzle (radial static ring + masked reveal — the corruption look)
     • the load-in (tiles assemble from background pixels)
     • opening a project — everything fizzles, the hero lands top-left and the
       copy wraps around it; a sticky scrolling-name home bar tops the page
     • closing (click the home bar, anywhere off a link/image, or Escape)
     • "more works": free page scroll (no buttons — the page just scrolls)
     • the hover description panel (pinned on screen so it serves the tiles
       below the fold too), the animations toggle, the contact form's AJAX
       submit, carousels and the lightbox
   ========================================================================== */

/* ── Pixel dissolve / reveal ──────────────────────────────────────────────
   Each tile gets an overlay grid of background-coloured cells. Fading the
   cells in covers (dissolves) the tile; fading them out reveals it. Per-cell
   random delays give the blocky corruption look. */
const PX = 22; // approx pixel-cell size — smaller = finer-grained (but heavier) corruption

function ensureOverlay(tile: HTMLElement): HTMLElement[] {
  const w = tile.clientWidth;
  const h = tile.clientHeight;
  const cols = Math.max(1, Math.round(w / PX));
  const rows = Math.max(1, Math.round(h / PX));
  let overlay = tile.querySelector<HTMLElement>(':scope > .pixel-overlay');
  if (overlay && overlay.dataset.cols === String(cols) && overlay.dataset.rows === String(rows)) {
    return Array.from(overlay.children) as HTMLElement[];
  }
  overlay?.remove();
  overlay = document.createElement('div');
  overlay.className = 'pixel-overlay';
  overlay.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  overlay.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  overlay.dataset.cols = String(cols);
  overlay.dataset.rows = String(rows);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < cols * rows; i++) {
    const c = document.createElement('div');
    c.className = 'pixel-cell';
    frag.appendChild(c);
  }
  overlay.appendChild(frag);
  tile.appendChild(overlay);
  return Array.from(overlay.children) as HTMLElement[];
}

const STAGGER = 220; // ms spread of the pager / load-in fizzle
const BUCKETS = 18;  // stagger granularity — cells pop in this many waves

type Point = { x: number; y: number };

// Random-bucket fizzle, used by the "more works" pager and the load-in: cells
// snap (no fade) in BUCKETS random waves over STAGGER ms — a blocky glitch the
// same in both directions. (The project open/close uses runStageWave instead,
// for a slower radial ripple.) setTimeout (not rAF) keeps it running in
// backgrounded tabs.
function pixelate(host: HTMLElement, cover: boolean, instant = false): Promise<void> {
  const cells = ensureOverlay(host);
  const target = cover ? '1' : '0';

  if (instant) {
    cells.forEach((c) => { c.style.transition = 'none'; c.style.opacity = target; });
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const groups: HTMLElement[][] = Array.from({ length: BUCKETS }, () => []);
    cells.forEach((c) => {
      c.style.transition = 'none';
      groups[(Math.random() * BUCKETS) | 0].push(c);
    });
    const step = STAGGER / BUCKETS;
    groups.forEach((group, i) => {
      setTimeout(() => { for (const c of group) c.style.opacity = target; }, i * step);
    });
    setTimeout(resolve, STAGGER + 40);
  });
}
const reveal = (t: HTMLElement) => pixelate(t, false);

/* ── Carousels (inside writeups) ─────────────────────────────────────────── */
function initCarousels(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.carousel').forEach((car) => {
    if (car.dataset.carInit) return;
    const imgs = Array.from(car.querySelectorAll<HTMLImageElement>(':scope > img'));
    if (imgs.length === 0) return;
    car.dataset.carInit = '1';
    const track = document.createElement('div');
    track.className = 'carousel-track';
    imgs.forEach((img) => {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.appendChild(img);
      track.appendChild(slide);
    });
    car.appendChild(track);
    const mkBtn = (cls: string, label: string, glyph: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `carousel-btn ${cls}`;
      b.setAttribute('aria-label', label);
      b.textContent = glyph;
      return b;
    };
    const prev = mkBtn('carousel-prev', 'Previous image', '‹');
    const next = mkBtn('carousel-next', 'Next image', '›');
    const counter = document.createElement('div');
    counter.className = 'carousel-counter';
    counter.textContent = `1 / ${imgs.length}`;
    car.append(prev, next, counter);
    let idx = 0;
    // Images can have different aspect ratios, so the track hugs the height of
    // the current slide (CSS animates the change) — every image shows whole,
    // uncropped, instead of being cover-cropped to a fixed box.
    const sizeTrack = (): void => {
      const h = imgs[idx]?.getBoundingClientRect().height ?? 0;
      if (h > 0) track.style.height = `${h}px`;
    };
    const go = (i: number) => {
      idx = (i + imgs.length) % imgs.length;
      track.scrollTo({ left: track.clientWidth * idx, behavior: reduced() ? 'auto' : 'smooth' });
      counter.textContent = `${idx + 1} / ${imgs.length}`;
      sizeTrack();
    };
    prev.addEventListener('click', (e) => { e.stopPropagation(); go(idx - 1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); go(idx + 1); });
    // Size to the first slide now and re-measure as images finish loading
    // (lazy ones report 0 height until then) and when the viewport reflows.
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener('load', () => { if (imgs[idx] === img) sizeTrack(); }, { once: true });
    });
    sizeTrack();
    window.addEventListener('resize', sizeTrack);
  });
}

/* ── Lightbox ─────────────────────────────────────────────────────────────
   Built lazily once; clicking a writeup image opens it fullscreen. */
let lightboxOpen = false;
function buildLightbox(): HTMLElement {
  let lb = document.getElementById('lightbox');
  if (lb) return lb;
  lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.className = 'lightbox-overlay';
  lb.setAttribute('hidden', '');
  lb.innerHTML = '<img class="lightbox-img" src="" alt="" />';
  document.body.appendChild(lb);
  lb.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });
  return lb;
}
function openLightbox(img: HTMLImageElement): void {
  const lb = buildLightbox();
  const lbImg = lb.querySelector('.lightbox-img') as HTMLImageElement;
  lbImg.src = img.src;
  lb.removeAttribute('hidden');
  lb.classList.remove('lb-out');
  lb.classList.add('lb-open');
  lightboxOpen = true;
}
function closeLightbox(): void {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.classList.remove('lb-open');
  lb.classList.add('lb-out');
  lb.addEventListener('animationend', () => {
    lb.setAttribute('hidden', '');
    lb.classList.remove('lb-out');
  }, { once: true });
  lightboxOpen = false;
}

/* ── Description panel (nav box, top row) ─────────────────────────────────
   Hovering anything with a data-desc shows that blurb in the panel — no
   animation, the text just swaps — and the panel empties again when the pointer
   leaves, so it only ever describes what's under the cursor right now.
   A blurb may carry a blank line (\n\n): .nav-desc-text is `white-space:
   pre-line`, so it renders as a paragraph gap rather than a literal newline. */
let descPanels: HTMLElement[] = [];
let descSource: HTMLElement | null = null; // whose blurb is currently showing

function setDesc(text: string): void {
  descPanels.forEach((p) => { p.textContent = text; });
}
const descOf = (el: HTMLElement | null | undefined): string => el?.dataset.desc?.trim() ?? '';

function initDescPanel(): void {
  descPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-desc-panel] .nav-desc-text'));
  if (descPanels.length === 0) return;
  document.querySelectorAll<HTMLElement>('[data-desc]').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      descSource = el;
      setDesc(descOf(el));
    });
    el.addEventListener('mouseleave', () => {
      if (descSource !== el) return; // some inner blurb already took over
      // Leaving a nested blurb hands back to the one that encloses it (none
      // today, but that's the behaviour you'd want the moment there is one);
      // leaving the outermost empties the panel.
      const outer = el.parentElement?.closest<HTMLElement>('[data-desc]') ?? null;
      descSource = outer;
      setDesc(descOf(outer));
    });
  });
}

/* Re-read a blurb that changed while it was on screen (the animations toggle
   rewrites its own — see below). No-op if it isn't the one showing. */
function refreshDesc(el: HTMLElement): void {
  if (descSource === el) setDesc(descOf(el));
}

/* ── Animations on/off toggle (accessibility) ─────────────────────────────
   Defaults to honouring prefers-reduced-motion. The switch drives
   html.reduce-motion, which the fizzle functions and CSS both respect. */
/* The toggle's blurb: what it does, then — after a blank line — which way it's
   currently thrown, so the state is spelled out in words and not left entirely
   to the tile's red/grey. */
const animDesc = (on: boolean): string =>
  `Toggle page change animations.\n\nAnimations are currently ${on ? 'ON' : 'OFF'}.`;

function initAnimToggle(): void {
  const switches = Array.from(document.querySelectorAll<HTMLInputElement>('[data-anim-switch]'));
  if (switches.length === 0) return;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apply = (on: boolean): void => {
    document.documentElement.classList.toggle('reduce-motion', !on);
    switches.forEach((s) => {
      s.checked = on;
      // Clicking the switch means the pointer is on its tile, so the panel is
      // showing this blurb: rewrite it and refresh it in place.
      const tile = s.closest<HTMLElement>('[data-desc]');
      if (!tile) return;
      tile.dataset.desc = animDesc(on);
      refreshDesc(tile);
    });
  };
  apply(!prefersReduced);
  switches.forEach((s) => s.addEventListener('change', () => apply(s.checked)));
}

/* ── Pinning the description panel ────────────────────────────────────────
   The panel is the only place a blurb appears, and half the projects live in
   the "more works" grid below the fold — so it has to stay on screen as the
   page scrolls. `position: sticky` can't do it: the stage is `overflow:
   hidden`, which makes the stage the panel's scrollport, and that never
   scrolls. So the panel is taken out of the nav grid and fixed over the slot it
   already occupies (.nav-desc-slot holds the space). It doesn't travel or
   re-dock — it simply never moves, and the page scrolls under it.

   Not on mobile: there's no hover on a touch screen, so a box floating over the
   page would be in the way for nothing. */
function initStickyDesc(): void {
  const panel = document.querySelector<HTMLElement>('.tile--nav > .nav-desc');
  const slot = document.querySelector<HTMLElement>('.nav-desc-slot');
  if (!panel || !slot) return;
  const place = (): void => {
    if (compact()) {
      panel.classList.remove('is-pinned');
      panel.style.cssText = '';
      return;
    }
    // The slot stays in the grid, so it can be measured at any scroll position;
    // + scrollY converts its viewport box to the page box, which is where the
    // panel should sit on screen (the stage starts at the top of the document).
    const r = slot.getBoundingClientRect();
    panel.classList.add('is-pinned');
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.top + window.scrollY}px`;
    panel.style.width = `${r.width}px`;
    panel.style.height = `${r.height}px`;
  };
  place();
  window.addEventListener('resize', place);
  // The slot stays in the grid and so tracks every layout change the panel has
  // to follow — including a page that loads in a hidden or zero-width viewport
  // and only gets its real size later, which a resize listener alone can miss.
  // (place() only ever touches the panel, so this can't re-trigger itself.)
  new ResizeObserver(place).observe(slot);
}

/* ── Open / close state ───────────────────────────────────────────────────
   Opening a view fizzles the whole stage and reveals its write-up (home bar +
   hero + copy) under the wave — see openView below. Both halves of the swap
   run at once (Promise.all), so the new page resolves while the old is still
   leaving: one motion, not "everything out, then everything in". */
let stage: HTMLElement | null = null;
let openId: string | null = null;

function gridCells(): HTMLElement[] {
  return Array.from(stage!.querySelectorAll<HTMLElement>('.landing-grid > .cell'));
}

function visibleTiles(): HTMLElement[] {
  return Array.from(stage!.querySelectorAll<HTMLElement>('.landing-grid .tile'));
}

/* Float the project's hero image into the TOP-LEFT of the writeup body and wrap
   the copy around it, so every project opens to the same layout regardless of
   which tile was clicked. The hero lives inside the (masked) write-up, so it
   fizzles in with the page. On mobile it's a full-width lead image. */
function layoutProjectHero(writeup: HTMLElement, coverSrc: string | null): void {
  const inner = writeup.querySelector<HTMLElement>(':scope > .writeup-inner') ?? writeup;
  let hero = inner.querySelector<HTMLElement>(':scope > .wrap-hero');
  if (!coverSrc) { hero?.remove(); return; }
  if (!hero) {
    hero = document.createElement('div');
    hero.className = 'wrap-hero';
    hero.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.className = 'wrap-hero-img';
    img.alt = '';
    hero.appendChild(img);
    inner.insertBefore(hero, inner.firstChild);
  }
  const img = hero.querySelector('img')!;
  if (img.getAttribute('src') !== coverSrc) img.src = coverSrc;
  // Match the top-left grid cell so the hero lands where a tile would.
  if (compact()) {
    hero.style.width = '';
    hero.style.height = '';
  } else {
    const cell0 = gridCells()[0].getBoundingClientRect();
    hero.style.width = `${Math.round(cell0.width)}px`;
    hero.style.height = `${Math.round(cell0.height)}px`;
  }
}

/* ── Browser history ──────────────────────────────────────────────────────
   The site is one page, but every "page change" a visitor would expect to undo
   with the Back button gets a real history entry: opening a project or the CV.
   The site isn't deep, so we
   keep AT MOST ONE entry above the home base — Back therefore always returns to
   the home page, never to an intermediate view. (Forward re-opens the last
   view.) The home base entry is tagged {home:true}; any open view is
   {home:false, …}, carrying enough to restore it on Forward.

   In-app "home" controls (the writeup bar, Escape, clicking off, toggling the
   view button back) don't animate directly — they call history.back(), so the
   popstate handler runs the one home transition. That keeps history in sync and
   makes "go home" look identical however it's triggered. */
type AwayState = { home: false; view: 'project' | 'cv'; id?: string };
const atHome = (): boolean => !(history.state && history.state.home === false);
let navigatingHome = false; // guards against double history.back() on rapid clicks

/* The real URL for an away view. Projects (and the CV) are deep-linkable at
   /p/<id>/ — matching the pre-rendered pages in src/pages/p/[slug].astro — so the
   address bar, bookmarks and sharing all work. */
function pathFor(state: Omit<AwayState, 'home'>): string {
  if (state.view === 'project' && state.id) return `/p/${state.id}/`;
  if (state.view === 'cv') return '/p/cv/';
  // Unreachable for real pushes (every away view is covered above); keeps the
  // URL unchanged rather than guessing if a malformed state ever slips in.
  return location.pathname;
}

/* Record that we've navigated away from home. Push a new back-target when
   leaving home; replace it when moving between away views, so there's only ever
   one entry to go Back through. The URL swaps to the view's own path. */
function pushAway(state: Omit<AwayState, 'home'>): void {
  const full: AwayState = { home: false, ...state };
  const url = pathFor(state);
  if (atHome()) history.pushState(full, '', url);
  else history.replaceState(full, '', url);
}

/* In-app home control → drive the Back button so popstate runs the transition. */
function goHomeViaHistory(): void {
  if (busy || navigatingHome) return;
  if (atHome()) { fizzleHome(); return; } // already at base (shouldn't happen) — just animate
  navigatingHome = true;
  history.back();
}

/* Forward button: re-open the away view recorded in the entry. */
function restoreView(state: AwayState): void {
  if (busy || !stage) return;
  const origin: Point = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
  if (state.view === 'cv') openView('cv', origin, null);
  else if (state.view === 'project' && state.id) {
    // Whole-document lookup (same as the deep-link boot): the tile may be a
    // .more-tile in the below-the-fold grid, outside the stage.
    const tile = document.querySelector<HTMLElement>(`[data-open="${state.id}"]`);
    const cover = tile?.querySelector<HTMLImageElement>('.tile-img')?.getAttribute('src') ?? null;
    openView(state.id, origin, cover);
  } else {
    // Unrecognised away state — e.g. an entry persisted by an older build
    // (like the removed personal-projects view). Nothing to restore; the home
    // grid is showing, so re-mark the entry as home to keep history in step.
    history.replaceState({ home: true }, '', '/');
  }
}

function onPopState(e: PopStateEvent): void {
  navigatingHome = false;
  if (e.state && e.state.home === false) restoreView(e.state as AwayState); // Forward → re-open
  else fizzleHome();                                                        // Back  → home
}

/* Open / close fizzle the WHOLE stage as one continuous radial wave rippling out
   from the clicked tile, with two cooperating parts:

   1. A stage-level static overlay (z 8). Every cell covers (→ background
      "static") at a time set by its distance from the origin, then uncovers HOLD
      ms later — a glitchy static RING that expands outward.
   2. A radial MASK on the write-up (z 6). The write-up is revealed (open) /
      hidden (close) pixel-by-pixel exactly at the wave's leading edge, so the
      old grid (left in place beneath, z auto) is swapped for the new page right
      under the static ring — no per-tile flicker, and the old + new pages coexist
      either side of the ring. The write-up carries its own hero + home bar, so
      the whole new page fizzles in together. */
const SPREAD = 440; // ms for the wavefront to travel origin → far corner
const HOLD = 80;    // ms a cell stays static (width of the static ring); < SPREAD ⇒ overlap
const JITTER = 25;  // ± ms per-cell timing jitter, so the wavefront stays ragged

/* Animations off (accessibility toggle / prefers-reduced-motion): the fizzle
   functions short-circuit to their end state instead of running the wave. */
const reduced = (): boolean => document.documentElement.classList.contains('reduce-motion');

/* Narrow / mobile: the grid is a stacked scroller, not a fixed 3×2 stage, so an
   opened project shows as a full-screen overlay (no radial fizzle, no hero
   wrap). html.view-open locks the page behind it. */
const compact = (): boolean => window.matchMedia('(max-width: 680px)').matches;

/* Centre of an element in stage-local coordinates — the ripple origin. */
function originOf(el: HTMLElement): Point {
  const sr = stage!.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top };
}

function maxDistFrom(origin: Point): number {
  const w = stage!.clientWidth || 1;
  const h = stage!.clientHeight || 1;
  return Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y)) || 1;
}

/* One radial cover→uncover pass over the stage overlay (the static ring).
   Cell times are bucketed to ~frame resolution so the whole wave runs on a few
   dozen timers instead of two per cell (~5k) — far fewer style flushes. */
function runStageWave(origin: Point): Promise<void> {
  const cells = ensureOverlay(stage!);
  const overlay = stage!.querySelector<HTMLElement>(':scope > .pixel-overlay');
  const cols = Math.max(1, +(overlay?.dataset.cols ?? 1));
  const rows = Math.max(1, +(overlay?.dataset.rows ?? 1));
  const w = stage!.clientWidth || 1;
  const h = stage!.clientHeight || 1;
  const maxDist = maxDistFrom(origin);
  const BIN = 16; // ms — one display frame; per-cell jitter stays visible
  const covers = new Map<number, HTMLElement[]>();
  const uncovers = new Map<number, HTMLElement[]>();
  cells.forEach((c, i) => {
    c.style.transition = 'none';
    const cx = ((i % cols) + 0.5) / cols * w;
    const cy = (((i / cols) | 0) + 0.5) / rows * h;
    const n = Math.hypot(cx - origin.x, cy - origin.y) / maxDist;
    const tc = Math.round(Math.max(0, n * SPREAD + (Math.random() * 2 - 1) * JITTER) / BIN) * BIN;
    (covers.get(tc) ?? covers.set(tc, []).get(tc)!).push(c);
    const tu = tc + HOLD;
    (uncovers.get(tu) ?? uncovers.set(tu, []).get(tu)!).push(c);
  });
  covers.forEach((group, t) => setTimeout(() => { for (const c of group) c.style.opacity = '1'; }, t));
  uncovers.forEach((group, t) => setTimeout(() => { for (const c of group) c.style.opacity = '0'; }, t));
  return new Promise((res) => setTimeout(res, SPREAD + HOLD + JITTER + 80));
}

/* Radial reveal/hide of an element via a hard-edged circular mask whose radius
   tracks the wave's leading edge (so the edge hides under the static ring).
   clearInside=false → element opaque inside the circle (reveals it from the
   origin out); clearInside=true → transparent inside (hides it from the origin
   out). Driven by rAF for a smooth edge. */
function setMask(el: HTMLElement, origin: Point, r: number, clearInside: boolean): void {
  const stops = clearInside ? `transparent ${r}px, #000 ${r}px` : `#000 ${r}px, transparent ${r}px`;
  const g = `radial-gradient(circle at ${origin.x}px ${origin.y}px, ${stops})`;
  el.style.webkitMaskImage = g;
  el.style.maskImage = g;
}
function animateMask(el: HTMLElement, origin: Point, maxDist: number, clearInside: boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      setMask(el, origin, maxDist, clearInside); // snap to final state
      resolve();
    };
    const tick = (now: number): void => {
      if (done) return;
      const t = now - start;
      if (t >= SPREAD) { finish(); return; }
      setMask(el, origin, (t / SPREAD) * maxDist, clearInside);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Fallback: rAF is paused when the tab isn't focused, so guarantee the
    // promise still settles (and the mask reaches its end state) via a timer.
    setTimeout(finish, SPREAD + 150);
  });
}
function clearMask(el: HTMLElement): void {
  el.style.webkitMaskImage = '';
  el.style.maskImage = '';
}

/* One lock for every stage transition (open / close / view-swap), so spam
   clicking can never overlap two waves — each runs to completion before the
   next can start. This is what makes the fizzle robust under rapid clicks. */
let busy = false;

/* Lock page scroll while a view is open (the fixed/absolute write-up must stay
   put) and, on desktop, snap to the top so the stage is in view; release on
   close. On mobile the write-up is a fixed overlay, so the page keeps its
   scroll position and closing returns the visitor to the tile they tapped. */
function lockScroll(): void {
  document.documentElement.classList.add('view-open');
  if (!compact()) window.scrollTo(0, 0);
}
function unlockScroll(): void {
  document.documentElement.classList.remove('view-open');
}

/* Open a write-up view (a project, with a hero; or the CV, coverSrc=null). The
   whole stage fizzles and the write-up — its home bar + hero + copy — reveals
   under the static ring from the click point out, so it all fizzles in as one
   page. The marquee animation is paused during the wave (.animating) for perf. */
/* Keep the tab title in step with what's open, so History-API navigation (and a
   cold deep-link → home) matches the per-project <title> the /p/ pages ship. */
const SITE_TITLE = 'Raphael Murray-Browne';
function setDocTitle(id: string | null): void {
  const name = id ? stage?.querySelector(`.writeup[data-for="${id}"] .writeup-title`)?.textContent?.trim() : '';
  document.title = name ? `${name} — ${SITE_TITLE}` : SITE_TITLE;
}

async function openView(id: string, origin: Point, coverSrc: string | null, instant = false): Promise<void> {
  if (openId || busy || !stage) return;
  busy = true;
  try {
    openId = id;
    setDocTitle(id);
    stage.classList.add('is-open');
    lockScroll();
    const maxDist = maxDistFrom(origin);
    const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
    if (writeup) {
      writeup.hidden = false;
      initCarousels(writeup);
      layoutProjectHero(writeup, coverSrc);
    }
    // Instant (no wave) for reduced-motion, mobile overlay, OR a cold deep-link
    // boot (where there's no click origin to ripple from — see init).
    if (reduced() || compact() || instant) { if (writeup) clearMask(writeup); return; }
    stage.classList.add('animating');
    if (writeup) setMask(writeup, origin, 0, false);
    await Promise.all([
      runStageWave(origin),
      writeup ? animateMask(writeup, origin, maxDist, false) : Promise.resolve(),
    ]);
    if (writeup) clearMask(writeup); // fully visible from here
  } finally {
    stage.classList.remove('animating');
    busy = false;
  }
}

/* Clicking a project: everything fizzles and its hero appears top-left. Pushes
   a history entry first (guarded by the same conditions openView checks, so we
   never record a navigation that doesn't actually run). */
function openProject(tile: HTMLElement, id: string): Promise<void> {
  if (openId || busy || !stage) return Promise.resolve();
  const cover = tile.querySelector<HTMLImageElement>('.tile-img')?.getAttribute('src') ?? null;
  pushAway({ view: 'project', id });
  return openView(id, originOf(tile), cover);
}
/* CV button: a full-page CV (no hero). The write-up's home bar is the way out. */
function openCV(origin: Point): Promise<void> {
  if (openId || busy || !stage) return Promise.resolve();
  pushAway({ view: 'cv' });
  return openView('cv', origin, null);
}

/* Return to the home page (nothing open) with a NON-radial fizzle — a uniform
   pixel "static" that washes over the whole stage, distinct from the radial
   ripple that opens a view. This is the one transition the Back button (and
   every in-app home control) runs: it closes the open write-up, switching the
   content while the stage is fully covered by static so nothing flashes. */
async function fizzleHome(): Promise<void> {
  if (!stage || busy) return;
  const id = openId;
  if (!id) return; // already home

  busy = true;
  try {
    const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);

    // Apply the home end-state (run behind the static cover, or instantly when
    // animations are off / on mobile's full-screen overlay).
    const settle = (): void => {
      if (writeup) { writeup.hidden = true; clearMask(writeup); }
      openId = null;
      stage!.classList.remove('is-open');
      unlockScroll();
      setDocTitle(null); // back on the home grid → site title
    };

    if (reduced() || compact()) { settle(); return; }

    stage.classList.add('animating');
    await pixelate(stage, true);  // cover the whole stage with uniform random static
    settle();                     // swap content while fully covered
    await pixelate(stage, false); // clear the static, revealing the home grid
  } finally {
    stage.classList.remove('animating');
    busy = false;
  }
}

/* ── Contact form ─────────────────────────────────────────────────────────
   Posts to FormSubmit's AJAX endpoint so the page never navigates away. The
   send button (inside the message box) IS the status display, via data-state:
   red "send" → blue working dots → blue "sent"/"error" → fades back to red
   "send"/"retry". (No separate status line.) */
function initContactForm(form: HTMLFormElement): void {
  if (form.dataset.contactInit === '1') return;
  form.dataset.contactInit = '1';

  const submit = form.querySelector<HTMLButtonElement>('.contact-submit');
  const label = form.querySelector<HTMLElement>('.contact-submit-label');
  const setState = (state: string, text?: string): void => {
    if (submit) submit.dataset.state = state;
    if (label && text != null) label.textContent = text;
  };

  // Keep clicks/keystrokes inside the form from bubbling up to the stage
  // click handler, which otherwise treats stray clicks as open/close gestures.
  form.addEventListener('click', (e) => e.stopPropagation());

  // The name + blurb are click targets: clicking either jumps focus straight
  // into the message box (a gentle nudge toward the one thing to do here).
  const message = form.querySelector<HTMLTextAreaElement>('.contact-message');
  form.closest('.contact-card')?.querySelectorAll<HTMLElement>('[data-focus-message]')
    .forEach((el) => el.addEventListener('click', (e) => {
      // ...unless it's the mailto link in the bio's closing line — that's a
      // deliberate choice of the other route, not a stray click on the blurb.
      if ((e.target as HTMLElement).closest('a')) return;
      message?.focus();
    }));

  // The button says what pressing it will actually do. With something written
  // but no email address filled in, the message arrives with no way to reply —
  // so it reads "send anonymously" rather than leaving that in the small print.
  // Same type size; the button just widens to fit (see .contact-submit).
  const email = form.querySelector<HTMLInputElement>('.contact-email');
  const idleLabel = (): string =>
    message?.value.trim() && !email?.value.trim() ? 'send anonymously' : 'send';
  const syncIdleLabel = (): void => {
    // Only while idle — mid-send the button is showing the status instead.
    if (!label || submit?.dataset.state !== 'idle') return;
    label.textContent = idleLabel();
  };
  message?.addEventListener('input', syncIdleLabel);
  email?.addEventListener('input', syncIdleLabel);

  // Show the blue result for a beat, then fade back to the red idle state.
  const finish = (resultText: string, idleText: string): void => {
    setState('result', resultText);
    setTimeout(() => setState('idle', idleText), 1500);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (submit?.dataset.state === 'working') return;
    setState('working'); // blue + 3-dot animation (label hidden via CSS)
    fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form),
    })
      .then((res) => {
        if (res.ok) { form.reset(); finish('sent', 'send'); }
        else { finish('error', 'retry'); }
      })
      .catch(() => finish('error', 'retry'));
  });
}

/* ── Click handling ──────────────────────────────────────────────────────── */
function onStageClick(e: MouseEvent): void {
  const target = e.target as Element;

  // While a view is open: the home bar returns home; other clicks close it,
  // unless it's a functional control (link, carousel button, zoomable image).
  // Home-going routes through the Back button (goHomeViaHistory) so the URL
  // history stays in step with what's on screen.
  if (openId) {
    if (lightboxOpen) return;
    if (target.closest('[data-home]')) { goHomeViaHistory(); return; }
    if (target.closest('a[href], .carousel-btn, .carousel-counter')) return;
    const img = target.closest('.project-body img') as HTMLImageElement | null;
    if (img) { openLightbox(img); return; }
    goHomeViaHistory();
    return;
  }

  // Nav-box buttons that aren't projects — just the CV page now.
  const actionEl = target.closest<HTMLElement>('[data-action]');
  if (actionEl?.dataset.action === 'cv') { openCV(originOf(actionEl)); return; }

  // Match on [data-open] rather than .tile: usually that IS the tile, but the
  // Essays card is a button nested inside the nav cell (a .tile with no
  // data-open of its own), so closest('.tile') would find the wrapper and stop.
  const opener = target.closest<HTMLElement>('[data-open]');
  if (opener?.dataset.open) openProject(opener, opener.dataset.open);
}

/* ── Init + load-in animation ────────────────────────────────────────────── */
function init(): void {
  stage = document.querySelector<HTMLElement>('.stage');
  if (!stage) return;

  // Hovering a tile fills the nav box's description panel
  initDescPanel();

  // ...and the panel is pinned on screen, so it serves the tiles below the fold
  initStickyDesc();

  // Animations on/off (accessibility) — sets html.reduce-motion
  initAnimToggle();

  // Contact form — AJAX submit via FormSubmit
  stage.querySelectorAll<HTMLFormElement>('.contact-form').forEach(initContactForm);

  stage.addEventListener('click', onStageClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (lightboxOpen) closeLightbox(); else if (openId) goHomeViaHistory(); return; }
    // Keyboard-activate the writeup home bar (role=button).
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element)?.closest?.('[data-home]')) {
      e.preventDefault();
      goHomeViaHistory();
    }
  });

  // History. On "/" we tag the home base entry and let Back/Forward drive the
  // home and re-open transitions. On a /p/<slug>/ deep-link the stage carries
  // data-open-initial: synthesise a home base at "/" *below* this entry, so Back
  // returns to the home grid within the app, then mark this entry as that view.
  const openInitial = stage.dataset.openInitial;
  if (openInitial) {
    const path = location.pathname + location.search;
    const isCV = openInitial === 'cv';
    history.replaceState({ home: true }, '', '/');
    history.pushState({ home: false, view: isCV ? 'cv' : 'project', id: isCV ? undefined : openInitial }, '', path);
  } else {
    // Booting onto the home grid: stamp this entry as the home base even if a
    // stale away state (e.g. an older build's removed view) was persisted on it.
    history.replaceState({ home: true }, '');
  }
  window.addEventListener('popstate', onPopState);

  // "More works" tiles live outside the stage (below the fold), so they get
  // their own click handler to open their writeup (e.g. Living Lamp).
  document.querySelector<HTMLElement>('[data-more-grid]')?.addEventListener('click', (e) => {
    const tile = (e.target as Element).closest<HTMLElement>('.more-tile[data-open]');
    if (tile?.dataset.open) openProject(tile, tile.dataset.open);
  });

  // The open project's hero is sized to the top-left grid cell — recompute it
  // when the grid reflows on resize. (CV has no hero; this is then a no-op.)
  let resizeRAF = 0;
  window.addEventListener('resize', () => {
    if (!openId || !stage) return;
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      const writeup = stage!.querySelector<HTMLElement>(`.writeup[data-for="${openId}"]`);
      if (!writeup) return;
      const cover = writeup.querySelector<HTMLImageElement>('.wrap-hero-img')?.getAttribute('src') ?? null;
      layoutProjectHero(writeup, cover);
    });
  });

  // Cold deep-link (/p/<slug>/): the grid sits under the open write-up, so skip
  // the load-in fizzle entirely — mark the grid ready, warm the stage overlay,
  // and open that view instantly (no click origin to ripple from).
  if (openInitial) {
    stage.classList.add('ready');
    ensureOverlay(stage);
    const isCV = openInitial === 'cv';
    const tile = document.querySelector<HTMLElement>(`[data-open="${openInitial}"]`);
    const cover = isCV ? null : (tile?.querySelector<HTMLImageElement>('.tile-img')?.getAttribute('src') ?? null);
    openView(openInitial, { x: stage.clientWidth / 2, y: stage.clientHeight / 2 }, cover, true);
    return;
  }

  // Load-in: cover every visible tile instantly, reveal the page, then clear
  // the pixels (reverse of the dissolve) so tiles assemble rather than flick in.
  // (Reduced motion: just show the grid; warm the overlay for later.)
  const tiles = visibleTiles();
  if (reduced()) {
    stage.classList.add('ready');
    ensureOverlay(stage);
    return;
  }
  Promise.all(tiles.map((t) => pixelate(t, true, true))).then(() => {
    stage!.classList.add('ready');
    setTimeout(() => tiles.forEach(reveal), 60);
    // Warm the full-stage fizzle overlay while idle so the first project open
    // doesn't pay the ~thousands-of-cells build cost mid-animation.
    setTimeout(() => { if (stage) ensureOverlay(stage); }, 400);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
