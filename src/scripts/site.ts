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

const STAGGER = 190; // ms spread of the dissolve — snappier than before

function pixelate(tile: HTMLElement, cover: boolean, instant = false): Promise<void> {
  const cells = ensureOverlay(tile);

  // Instant: snap every cell synchronously (no stagger, no paint gap). Used to
  // pre-cover a tile/writeup so it can fizzle in without flashing uncovered.
  if (instant) {
    cells.forEach((c) => {
      c.style.transition = 'none';
      c.style.transitionDelay = '0ms';
      c.style.opacity = cover ? '1' : '0';
    });
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let maxDelay = 0;
    cells.forEach((c) => {
      const d = Math.random() * STAGGER;
      maxDelay = Math.max(maxDelay, d);
      // No fade — cells snap straight to their end state. Combined with the
      // per-cell stagger this reads as an abrupt, glitchy flicker rather than
      // a smooth dissolve. (transitionDelay still staggers *when* each cell
      // pops, even with an instant transition.)
      c.style.transition = 'opacity 0s linear';
      c.style.transitionDelay = `${d}ms`;
    });
    // Apply the opacity change on the next macrotask. setTimeout (not rAF) so
    // it still fires when the tab is backgrounded — keeps the open/close
    // promise chain from stalling.
    setTimeout(() => {
      cells.forEach((c) => { c.style.opacity = cover ? '1' : '0'; });
    }, 0);
    setTimeout(resolve, maxDelay + 60);
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

/* Open / close fizzle the WHOLE stage as one pixel field — the same look as the
   "more works" pager, but page-wide. A stage-level overlay (raised above the
   writeup, but BELOW the persisting tile's cell) covers everything except the
   hero image + title: the rest of the page dissolves to static, then resolves
   into the write-up (open) or back into the grid (close). */
const dissolveStage = (): Promise<void> => pixelate(stage!, true);
const revealStage = (): Promise<void> => pixelate(stage!, false);

async function openProject(cell: HTMLElement, tile: HTMLElement, id: string): Promise<void> {
  if (openId || paging || !stage) return;
  openId = id;
  stage.classList.add('is-open');
  cell.classList.add('cell--active'); // raise the persisting tile + slice its title

  // Phase 1 — everything but the persisting tile fizzles to static.
  await dissolveStage();

  // Show the write-up first (so it has real dimensions to measure), then lay it
  // over the whole stage wrapping the hero image. It's still under the static
  // overlay at this point, so showing it can't flash.
  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (writeup) {
    writeup.hidden = false;
    initCarousels(writeup);
    layoutFullStage(writeup, tile);
  }

  // Phase 2 — the static clears, resolving into the write-up.
  await revealStage();
}

async function closeProject(): Promise<void> {
  if (!openId || !stage) return;
  const id = openId;
  openId = null;

  // Phase 1 — the open write-up fizzles back to static.
  await dissolveStage();

  // Drop the write-up so the home grid sits beneath the static, then…
  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (writeup) writeup.hidden = true;

  // Phase 2 — …the static clears, resolving back into the grid.
  await revealStage();

  stage.querySelector('.cell--active')?.classList.remove('cell--active');
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
