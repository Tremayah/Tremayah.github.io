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

/* ── Typing reveal ────────────────────────────────────────────────────────
   Wrap each character of a container in a hidden span, then fade them in a
   few per tick. Skips image containers so their layout isn't disturbed. */
function typeInto(container: HTMLElement, chunk = 40, tick = 16): () => void {
  const chars: HTMLElement[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text) return;
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.opacity = '0';
        chars.push(s);
        frag.appendChild(s);
      }
      node.parentNode?.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const cls = (node as Element).classList;
      if (cls?.contains('img-grid') || cls?.contains('hero-pair') ||
          cls?.contains('hero-trio') || cls?.contains('carousel')) return;
      Array.from(node.childNodes).forEach(walk);
    }
  };
  walk(container);

  let idx = 0;
  const timer = setInterval(() => {
    for (let i = 0; i < chunk && idx < chars.length; i++, idx++) chars[idx].style.opacity = '1';
    if (idx >= chars.length) clearInterval(timer);
  }, tick);
  return () => clearInterval(timer);
}

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
const dissolve = (t: HTMLElement) => pixelate(t, true);
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

/* ── Hover overview typing on photo tiles ────────────────────────────────── */
function initHover(tile: HTMLElement): void {
  const textEl = tile.querySelector<HTMLElement>('.tile-overview-text');
  if (!textEl) return;
  const full = (textEl.textContent ?? '').trim();
  textEl.textContent = '';
  let cancel: (() => void) | null = null;
  tile.addEventListener('mouseenter', () => {
    if (stage?.classList.contains('is-open')) return;
    cancel?.();
    textEl.textContent = full;
    cancel = typeInto(textEl, 5, 10);
  });
  tile.addEventListener('mouseleave', () => {
    cancel?.();
    textEl.textContent = '';
  });
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

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
function layoutFullStage(writeup: HTMLElement, tile: HTMLElement): void {
  writeup.style.cssText = ''; // drop any leftover inline rectangle; fill via CSS inset:0

  let spacer = writeup.querySelector<HTMLElement>(':scope > .wrap-spacer');
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
   from the clicked tile. Every overlay cell covers (→ background "static") then,
   HOLD ms later, uncovers (→ whatever's beneath). Because the uncover trails the
   cover by less than the full travel time, the two waves OVERLAP: the inner
   region already shows the destination page while the outer region still shows
   the source one, with a moving static ring between them.

   The trick that lets old + new coexist on screen: the source tiles sit ABOVE
   the writeup ('.stage.is-open .cell' is raised) so the grid shows until — as the
   static ring fully covers each tile — we flip that tile's visibility: hidden on
   open (revealing the writeup beneath), shown on close (revealing the grid). The
   persisting tile's cell is raised higher still, above the static, so the hero
   image + title never fizzle. */
const SPREAD = 440; // ms for the wavefront to travel origin → far corner (~2× the previous speed)
const HOLD = 180;   // ms a cell stays static; how far the uncover trails the cover (< SPREAD ⇒ overlap)
const JITTER = 25;  // ± ms per-cell timing jitter, so the wavefront stays ragged

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

/* When the static ring has fully covered an element (its farthest corner) — the
   safe moment to flip its visibility, hidden under the static. */
function coverDoneTime(el: HTMLElement, origin: Point, maxDist: number): number {
  const sr = stage!.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  let far = 0;
  for (const x of [r.left, r.right]) {
    for (const y of [r.top, r.bottom]) {
      far = Math.max(far, Math.hypot(x - sr.left - origin.x, y - sr.top - origin.y));
    }
  }
  return (far / maxDist) * SPREAD + JITTER;
}

/* One radial cover→uncover pass over the stage overlay. Resolves when settled. */
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

async function openProject(cell: HTMLElement, tile: HTMLElement, id: string): Promise<void> {
  if (openId || paging || !stage) return;
  openId = id;
  stage.classList.add('is-open');
  cell.classList.add('cell--active'); // raise the persisting tile (above the static) + slice its title
  const origin = originOf(tile);

  // Write-up goes UNDER the (raised) grid tiles, so the page still reads as the
  // grid; as the static ring passes each OTHER tile we hide it, revealing the
  // write-up beneath — the new page resolving from the centre out while the
  // edges still show the old grid.
  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (writeup) {
    writeup.hidden = false;
    initCarousels(writeup);
    layoutFullStage(writeup, tile);
  }
  const maxDist = maxDistFrom(origin);
  const others = visibleTiles().filter((t) => t !== tile);
  others.forEach((t) => setTimeout(() => { t.style.visibility = 'hidden'; }, coverDoneTime(t, origin, maxDist)));

  await runStageWave(origin);
  others.forEach((t) => { t.style.visibility = 'hidden'; }); // settle
}

async function closeProject(): Promise<void> {
  if (!openId || !stage) return;
  const id = openId;
  openId = null;

  const active = stage.querySelector<HTMLElement>('.cell--active');
  const persist = active?.querySelector<HTMLElement>(`.tile[data-page="${stage.dataset.page ?? '1'}"]`) ?? null;
  const origin = persist ? originOf(persist) : { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };

  // Mirror of open: the write-up is the old page; as the static ring passes each
  // hidden grid tile we show it again, so the grid resolves back from the centre
  // out while the edges still show the write-up.
  const maxDist = maxDistFrom(origin);
  const others = visibleTiles().filter((t) => t !== persist);
  others.forEach((t) => setTimeout(() => { t.style.visibility = ''; }, coverDoneTime(t, origin, maxDist)));

  await runStageWave(origin);

  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (writeup) writeup.hidden = true;
  others.forEach((t) => { t.style.visibility = ''; }); // settle
  active?.classList.remove('cell--active');
  stage.classList.remove('is-open');
}

/* ── Contact form (the old "name" tile is now a message box) ──────────────
   Submits through FormSubmit's AJAX endpoint so the page never navigates
   away — we show inline status text instead. Email is optional; FormSubmit
   relays whatever's filled in straight to Raphael's inbox either way. */
function initContactForm(form: HTMLFormElement): void {
  if (form.dataset.contactInit === '1') return;
  form.dataset.contactInit = '1';

  const status = form.querySelector<HTMLElement>('.contact-status');
  const submit = form.querySelector<HTMLButtonElement>('.contact-submit');
  const setStatus = (msg: string) => { if (status) status.textContent = msg; };

  // Keep clicks/keystrokes inside the form from bubbling up to the stage
  // click handler, which otherwise treats stray clicks as open/close gestures.
  form.addEventListener('click', (e) => e.stopPropagation());

  // The name + blurb are click targets: clicking either jumps focus straight
  // into the message box (a gentle nudge toward the one thing to do here).
  const message = form.querySelector<HTMLTextAreaElement>('.contact-message');
  form.closest('.contact-card')?.querySelectorAll<HTMLElement>('[data-focus-message]')
    .forEach((el) => el.addEventListener('click', () => message?.focus()));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    setStatus('sending…');
    fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form),
    })
      .then((res) => {
        if (res.ok) {
          setStatus('sent — thank you.');
          form.reset();
        } else {
          setStatus("couldn't send that — try again?");
        }
      })
      .catch(() => setStatus("couldn't send that — try again?"))
      .finally(() => { if (submit) submit.disabled = false; });
  });
}

/* ── "More works" pager ──────────────────────────────────────────────────
   Each swapping cell flips on its own: the current tile dissolves to
   background, then the next project resolves from background in the same
   spot. Staggering the starts sends a wave across the grid, so some cells
   already show the new set while others are still clearing the old — one
   continuous motion rather than "all out, then all in". The "more works"
   tile itself is persistent and never flips. */
let paging = false;

async function flipTile(leaving: HTMLElement, entering: HTMLElement, startDelay: number): Promise<void> {
  if (startDelay) await wait(startDelay);
  await dissolve(leaving);          // cover the outgoing tile
  entering.style.display = 'flex';  // bring the incoming one in (still hidden)…
  pixelate(entering, true, true);   // …pre-cover it synchronously so it can't flash…
  leaving.style.display = 'none';
  await reveal(entering);           // …then fizzle it in
}

async function setPage(page: '1' | '2'): Promise<void> {
  if (!stage || paging || openId || stage.dataset.page === page) return;
  paging = true;
  const prev = stage.dataset.page ?? '1';

  const flips = gridCells()
    .map((cell) => ({
      leaving: cell.querySelector<HTMLElement>(`.tile[data-page="${prev}"]`),
      entering: cell.querySelector<HTMLElement>(`.tile[data-page="${page}"]`),
    }))
    .filter((f): f is { leaving: HTMLElement; entering: HTMLElement } =>
      !!f.leaving && !!f.entering && !f.entering.classList.contains('tile--persist'));

  await Promise.all(flips.map((f, i) => flipTile(f.leaving, f.entering, i * 60)));

  stage.dataset.page = page;
  // Hand visibility back to the CSS page-toggle now that data-page matches.
  flips.forEach((f) => {
    f.leaving.style.removeProperty('display');
    f.entering.style.removeProperty('display');
  });
  paging = false;
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

  const tile = target.closest<HTMLElement>('.tile');
  if (!tile) return;
  const action = tile.dataset.action;
  // "More works" toggles — click again (there's no separate "back" tile) to return.
  if (action === 'more') { setPage(stage!.dataset.page === '2' ? '1' : '2'); return; }
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

  // Hover typing on photo tiles
  stage.querySelectorAll<HTMLElement>('.tile--photo').forEach(initHover);

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
  const tiles = visibleTiles();
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
