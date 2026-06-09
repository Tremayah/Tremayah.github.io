/* ============================================================================
   Single-page portfolio behaviour.

   The whole site is one page (index.astro): a 3×2 grid of tiles with every
   project's writeup embedded and hidden. This script drives:
     • the pixel dissolve/reveal animation (corruption look)
     • the load-in (tiles assemble from background pixels)
     • opening a project in place — the clicked tile stays put while the rest
       dissolve and the writeup fizzles into the freed grid rectangle
     • closing (click anywhere that isn't a link/carousel button/zoom image)
     • the "more works" pager (per-cell crossfade to a second set of projects)
     • the hover overview typing on photo tiles
   ========================================================================== */

/* ── Word-split (slice animation on titles) ──────────────────────────────── */
function buildSplitWords(el: HTMLElement): void {
  if (el.dataset.split) return;
  el.dataset.split = '1';
  const text = el.textContent?.trim() ?? '';
  el.textContent = '';
  const words = text.split(' ');
  words.forEach((word, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'word-wrap';
    const top = document.createElement('span');
    top.className = 'word-half word-top';
    top.textContent = word;
    const bot = document.createElement('span');
    bot.className = 'word-half word-bot';
    bot.textContent = word;
    bot.setAttribute('aria-hidden', 'true');
    wrap.append(top, bot);
    el.appendChild(wrap);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
}

/* ── Pixel dissolve / reveal ──────────────────────────────────────────────
   Each tile gets an overlay grid of background-coloured cells. Fading the
   cells in covers (dissolves) the tile; fading them out reveals it. Per-cell
   random delays give the blocky corruption look. */
const PX = 17; // approx pixel-cell size — smaller = finer-grained corruption

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
    const go = (i: number) => {
      idx = (i + imgs.length) % imgs.length;
      track.scrollTo({ left: track.clientWidth * idx, behavior: 'smooth' });
      counter.textContent = `${idx + 1} / ${imgs.length}`;
    };
    prev.addEventListener('click', (e) => { e.stopPropagation(); go(idx - 1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); go(idx + 1); });
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

/* ── Description panel (nav box, top-left) ────────────────────────────────
   Hovering any tile with a data-desc shows that blurb in the shared panel —
   no animation, the text just swaps. Leaving restores the default hint. */
function initDescPanel(): void {
  // The nav box renders on both pages, so there can be more than one panel —
  // update them all, and only the visible one shows.
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-desc-panel] .nav-desc-text'));
  if (panels.length === 0) return;
  const hint = (panels[0].textContent ?? '').trim();
  const set = (text: string): void => panels.forEach((p) => { p.textContent = text; });
  document.querySelectorAll<HTMLElement>('[data-desc]').forEach((el) => {
    el.addEventListener('mouseenter', () => set(el.dataset.desc ?? hint));
    el.addEventListener('mouseleave', () => set(hint));
  });
}

/* ── Animations on/off toggle (accessibility) ─────────────────────────────
   Defaults to honouring prefers-reduced-motion. Both nav pages carry a switch;
   they're kept in sync and drive html.reduce-motion, which the fizzle functions
   and CSS both respect. */
function initAnimToggle(): void {
  const switches = Array.from(document.querySelectorAll<HTMLInputElement>('[data-anim-switch]'));
  if (switches.length === 0) return;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apply = (on: boolean): void => {
    document.documentElement.classList.toggle('reduce-motion', !on);
    switches.forEach((s) => { s.checked = on; });
  };
  apply(!prefersReduced);
  switches.forEach((s) => s.addEventListener('change', () => apply(s.checked)));
}

/* ── Open / close a project in place ──────────────────────────────────────
   The clicked tile stays exactly where it is — its hero image and sliced
   title anchor the view. Every OTHER visible tile dissolves to background,
   and the writeup fizzles in to fill the largest grid-aligned rectangle the
   freed cells leave behind. Both halves of the swap run at once (Promise.all),
   so the new content resolves from background while the old is still leaving:
   one motion, not "everything out, then everything in". */
let stage: HTMLElement | null = null;
let openId: string | null = null;

function gridCells(): HTMLElement[] {
  return Array.from(stage!.querySelectorAll<HTMLElement>('.landing-grid > .cell'));
}

function visibleTiles(): HTMLElement[] {
  const page = stage!.dataset.page ?? '1';
  return Array.from(stage!.querySelectorAll<HTMLElement>(`.tile[data-page="${page}"]`));
}

/* Lay the writeup across the WHOLE stage and float an invisible spacer the
   size + position of the persisting tile, so the body copy wraps around the
   hero image like a magazine. The real tile sits above the writeup (its cell
   is raised in CSS), showing through the gap the spacer holds the text out of. */
function layoutFullStage(writeup: HTMLElement, tile: HTMLElement | null): void {
  writeup.style.cssText = ''; // drop any leftover inline rectangle; fill via CSS inset:0

  const existing = writeup.querySelector<HTMLElement>(':scope > .wrap-spacer');
  // No hero tile (e.g. the CV page) → no wrap; the text just fills the stage.
  if (!tile) { existing?.remove(); return; }

  let spacer = existing;
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.className = 'wrap-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    writeup.insertBefore(spacer, writeup.firstChild);
  }

  const cs = getComputedStyle(writeup);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;
  const wr = writeup.getBoundingClientRect();
  const tr = tile.getBoundingClientRect();
  const gap = 20;
  const contentW = writeup.clientWidth - padL - padR;
  const relLeft = tr.left - wr.left - padL;
  const relRight = tr.right - wr.left - padL;
  const relTop = tr.top - wr.top - padT;

  // Float toward whichever side the tile sits on, so the text fills the larger
  // area beside and below it.
  if ((relLeft + relRight) / 2 < contentW / 2) {
    spacer.style.float = 'left';
    spacer.style.width = `${Math.max(0, relRight + gap)}px`;
  } else {
    spacer.style.float = 'right';
    spacer.style.width = `${Math.max(0, contentW - relLeft + gap)}px`;
  }
  spacer.style.height = `${Math.max(0, relTop + tr.height + gap)}px`;
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
      either side of the ring. The persisting tile (z 10) stays above everything,
      so the hero image + title never fizzle. */
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

/* One radial cover→uncover pass over the stage overlay (the static ring). */
function runStageWave(origin: Point): Promise<void> {
  const cells = ensureOverlay(stage!);
  const overlay = stage!.querySelector<HTMLElement>(':scope > .pixel-overlay');
  const cols = Math.max(1, +(overlay?.dataset.cols ?? 1));
  const rows = Math.max(1, +(overlay?.dataset.rows ?? 1));
  const w = stage!.clientWidth || 1;
  const h = stage!.clientHeight || 1;
  const maxDist = maxDistFrom(origin);
  cells.forEach((c, i) => {
    c.style.transition = 'none';
    const cx = ((i % cols) + 0.5) / cols * w;
    const cy = (((i / cols) | 0) + 0.5) / rows * h;
    const n = Math.hypot(cx - origin.x, cy - origin.y) / maxDist;
    const tc = Math.max(0, n * SPREAD + (Math.random() * 2 - 1) * JITTER);
    setTimeout(() => { c.style.opacity = '1'; }, tc);        // cover → static
    setTimeout(() => { c.style.opacity = '0'; }, tc + HOLD); // uncover → content beneath
  });
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

async function openProject(cell: HTMLElement, tile: HTMLElement, id: string): Promise<void> {
  if (openId || paging || !stage) return;
  openId = id;
  stage.classList.add('is-open');
  // cell--active: z-raise (must persist through close). cell--reading: blue +
  // sliced title — added/removed on the click itself, never gated by the fizzle.
  cell.classList.add('cell--active', 'cell--reading');
  const origin = originOf(tile);
  const maxDist = maxDistFrom(origin);

  // The write-up sits over the grid (z 6 > tiles); masked to nothing at first so
  // the grid still shows, then revealed outward from the click point as the
  // static ring passes — the grid beneath is left untouched and simply covered.
  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (writeup) {
    writeup.hidden = false;
    initCarousels(writeup);
    layoutFullStage(writeup, compact() ? null : tile); // mobile: no hero wrap
  }
  if (reduced() || compact()) { // instant, no wave
    if (compact()) document.documentElement.classList.add('view-open');
    if (writeup) clearMask(writeup);
    return;
  }
  if (writeup) setMask(writeup, origin, 0, false);

  await Promise.all([
    runStageWave(origin),
    writeup ? animateMask(writeup, origin, maxDist, false) : Promise.resolve(),
  ]);
  if (writeup) clearMask(writeup); // fully visible from here
}

/* The CV button fizzles the whole stage onto a full-page CV view. Unlike a
   project open, the persisting tile is the NAV BOX (raised via cell--active), so
   its buttons stay above the CV — that's how you get back out. The CV text wraps
   around the nav box like a hero image. Closing works through closeProject. */
async function openCV(origin: Point): Promise<void> {
  if (openId || paging || !stage) return;
  openId = 'cv';
  stage.classList.add('is-open');
  const navCell = stage.querySelector<HTMLElement>('.tile--nav')?.closest<HTMLElement>('.cell') ?? null;
  navCell?.classList.add('cell--active');
  const page = stage.dataset.page ?? '1';
  const navTile = navCell?.querySelector<HTMLElement>(`.tile[data-page="${page}"]`) ?? null;
  const maxDist = maxDistFrom(origin);
  const writeup = stage.querySelector<HTMLElement>('.writeup[data-for="cv"]');
  if (writeup) {
    writeup.hidden = false;
    initCarousels(writeup);
    layoutFullStage(writeup, compact() ? null : navTile); // desktop: wrap around nav box
  }
  if (reduced() || compact()) {
    if (compact()) document.documentElement.classList.add('view-open');
    if (writeup) clearMask(writeup);
    return;
  }
  if (writeup) setMask(writeup, origin, 0, false);
  await Promise.all([
    runStageWave(origin),
    writeup ? animateMask(writeup, origin, maxDist, false) : Promise.resolve(),
  ]);
  if (writeup) clearMask(writeup);
}

async function closeProject(): Promise<void> {
  if (!openId || !stage) return;
  const id = openId;
  openId = null;

  const active = stage.querySelector<HTMLElement>('.cell--active');
  const persist = active?.querySelector<HTMLElement>(`.tile[data-page="${stage.dataset.page ?? '1'}"]`) ?? null;
  // Un-slice / un-blue the title immediately on the click — snappy feedback that
  // doesn't wait for the fizzle. (cell--active/z-raise stays until the wave ends.)
  active?.classList.remove('cell--reading');
  const origin = persist ? originOf(persist) : { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
  const maxDist = maxDistFrom(origin);

  // Mirror of open: the write-up (old page) is masked AWAY from the click point
  // out, revealing the grid beneath right under the static ring.
  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (!reduced() && !compact()) {
    if (writeup) setMask(writeup, origin, 0, true);
    await Promise.all([
      runStageWave(origin),
      writeup ? animateMask(writeup, origin, maxDist, true) : Promise.resolve(),
    ]);
  }

  if (writeup) { writeup.hidden = true; clearMask(writeup); }
  active?.classList.remove('cell--active');
  stage.classList.remove('is-open');
  document.documentElement.classList.remove('view-open'); // unlock mobile overlay
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
    .forEach((el) => el.addEventListener('click', () => message?.focus()));

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

/* ── View swap (radial) ────────────────────────────────────────────────────
   "Personal projects" swaps cells 0–4 between page 1 (the landing) and page 2
   (placeholder project tiles), as a radial wave from the clicked button: the
   stage static ring expands outward, and each cell switches its tile to the new
   page just as the ring covers it, so the new set is revealed from the click
   point out — same look as opening a project, but swapping the whole grid. The
   nav box (tile--persist) doesn't swap. */
let paging = false;

async function setView(page: '1' | '2', origin: Point): Promise<void> {
  if (!stage || paging || openId || stage.dataset.page === page) return;
  paging = true;
  const prev = stage.dataset.page ?? '1';
  if (reduced() || compact()) { stage.dataset.page = page; paging = false; return; } // instant swap via CSS
  const sr = stage.getBoundingClientRect();
  const maxDist = maxDistFrom(origin);

  const swaps = gridCells()
    .map((cell) => ({
      cell,
      leaving: cell.querySelector<HTMLElement>(`.tile[data-page="${prev}"]`),
      entering: cell.querySelector<HTMLElement>(`.tile[data-page="${page}"]`),
    }))
    .filter((s): s is { cell: HTMLElement; leaving: HTMLElement; entering: HTMLElement } =>
      !!s.leaving && !!s.entering && !s.entering.classList.contains('tile--persist'));

  // Switch each cell's visible tile when the wavefront reaches its centre + half
  // the ring's hold, i.e. while it's fully covered by static, so nothing flashes.
  swaps.forEach((s) => {
    const r = s.cell.getBoundingClientRect();
    const cx = r.left + r.width / 2 - sr.left;
    const cy = r.top + r.height / 2 - sr.top;
    const tc = Math.max(0, (Math.hypot(cx - origin.x, cy - origin.y) / maxDist) * SPREAD);
    setTimeout(() => {
      s.leaving.style.display = 'none';
      s.entering.style.display = 'flex';
    }, tc + HOLD / 2);
  });

  await runStageWave(origin);

  stage.dataset.page = page;
  // Hand visibility back to the CSS page-toggle now that data-page matches.
  swaps.forEach((s) => {
    s.leaving.style.removeProperty('display');
    s.entering.style.removeProperty('display');
  });
  paging = false;
}

/* ── "More works" scroll toggle ────────────────────────────────────────────
   The page is normally clipped to one screen. Toggling .more-open on <html>
   makes it scrollable so the extra .more-grid tiles below come into view; the
   "more works" button stays blue while expanded. Toggling off scrolls back to
   the top and re-locks. The grid handles any number of extra tiles. */
function toggleMore(): void {
  const open = document.documentElement.classList.toggle('more-open');
  const moreGrid = document.querySelector<HTMLElement>('[data-more-grid]');
  moreGrid?.setAttribute('aria-hidden', open ? 'false' : 'true');
  const behavior: ScrollBehavior = reduced() ? 'auto' : 'smooth';
  // Reveal → scroll down to the extra tiles; collapse → return to the top. (rAF
  // so the overflow:auto from .more-open is applied before we scroll.)
  const rect = moreGrid?.getBoundingClientRect();
  const target = open ? window.scrollY + (rect?.top ?? window.innerHeight) : 0;
  requestAnimationFrame(() => window.scrollTo({ top: target, behavior }));
}

/* ── Click handling ──────────────────────────────────────────────────────── */
function onStageClick(e: MouseEvent): void {
  const target = e.target as Element;

  // While a project is open: a click closes it, unless it's a functional
  // control (a link, a carousel button, or a zoomable writeup image).
  if (openId) {
    if (lightboxOpen) return;
    if (target.closest('a[href], .carousel-btn')) return;
    const img = target.closest('.project-body img') as HTMLImageElement | null;
    if (img) { openLightbox(img); return; }
    closeProject();
    return;
  }

  // Nav-box section buttons (the 2×2 cell): toggle the personal-projects view,
  // open the CV, or expand "more works".
  const actionEl = target.closest<HTMLElement>('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'view') {
      // The one view button doubles as a toggle: into the view, then back home.
      const view = (actionEl.dataset.view as '1' | '2') ?? '2';
      setView(stage!.dataset.page === view ? '1' : view, originOf(actionEl));
      return;
    }
    if (action === 'cv') { openCV(originOf(actionEl)); return; }
    if (action === 'more') { toggleMore(); return; }
  }

  const tile = target.closest<HTMLElement>('.tile');
  if (!tile) return;
  if (tile.dataset.open) {
    const cell = tile.closest<HTMLElement>('.cell');
    if (cell) openProject(cell, tile, tile.dataset.open);
  }
}

/* ── Init + load-in animation ────────────────────────────────────────────── */
function init(): void {
  stage = document.querySelector<HTMLElement>('.stage');
  if (!stage) return;

  // Slice animation: split every tile title into word-halves (each stacked
  // line of the contact name is its own span, so split them individually —
  // splitting the whole heading would collapse the line breaks).
  stage.querySelectorAll<HTMLElement>('.tile-name, .tile-label, .contact-name span')
    .forEach(buildSplitWords);

  // Hovering a tile fills the nav box's description panel
  initDescPanel();

  // Animations on/off (accessibility) — sets html.reduce-motion
  initAnimToggle();

  // Contact form — AJAX submit via FormSubmit
  stage.querySelectorAll<HTMLFormElement>('.contact-form').forEach(initContactForm);

  stage.addEventListener('click', onStageClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (lightboxOpen) closeLightbox(); else if (openId) closeProject(); }
  });

  // The open write-up wraps around the persisting tile, whose position shifts
  // when the grid reflows — recompute the wrap spacer on resize.
  let resizeRAF = 0;
  window.addEventListener('resize', () => {
    if (!openId || !stage) return;
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      const page = stage!.dataset.page ?? '1';
      const tile = stage!.querySelector<HTMLElement>(`.cell--active .tile[data-page="${page}"]`);
      const writeup = stage!.querySelector<HTMLElement>(`.writeup[data-for="${openId}"]`);
      if (tile && writeup) layoutFullStage(writeup, tile);
    });
  });

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
