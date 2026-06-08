/* ============================================================================
   Single-page portfolio behaviour.

   The whole site is one page (index.astro): a 3×2 grid of tiles with every
   project's writeup embedded and hidden. This script drives:
     • the pixel dissolve/reveal animation (corruption look)
     • the load-in (tiles assemble from background pixels)
     • opening a project in place (other tiles dissolve, writeup fills + types)
     • closing (click the image or any non-interactive area)
     • the "more works" pager (swap the other five tiles to a second set)
     • the hover overview typing on photo tiles
   ========================================================================== */

const GAP = 0; // grid gap is read live where needed

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
  return new Promise((resolve) => {
    let maxDelay = 0;
    cells.forEach((c) => {
      const d = instant ? 0 : Math.random() * STAGGER;
      maxDelay = Math.max(maxDelay, d);
      // No fade — cells snap straight to their end state. Combined with the
      // per-cell stagger this reads as an abrupt, glitchy flicker rather than
      // a smooth dissolve. (transitionDelay still staggers *when* each cell
      // pops, even with an instant transition.)
      c.style.transition = instant ? 'none' : 'opacity 0s linear';
      c.style.transitionDelay = instant ? '0ms' : `${d}ms`;
    });
    // Apply the opacity change on the next macrotask. setTimeout (not rAF) so
    // it still fires when the tab is backgrounded — keeps the open/close
    // promise chain from stalling.
    setTimeout(() => {
      cells.forEach((c) => { c.style.opacity = cover ? '1' : '0'; });
    }, 0);
    setTimeout(resolve, instant ? 0 : maxDelay + 60);
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

/* ── "Flower" layout: writeup text wraps around the persisting tile ───────
   The writeup becomes a grid that mirrors the landing grid exactly (see
   .writeup--flower in global.css — same 3×2 template + shared gap/padding
   tokens). The description and each body paragraph ("petals") are placed,
   in reading order, into the five cells that surround the opened tile; its
   own cell is left empty so the tile shows through. Built once per writeup
   and cached — every writeup always opens from the same cell, so the
   mapping never changes on reopen. */
function layoutFlower(writeup: HTMLElement, cellIndex: number): void {
  if (writeup.dataset.flowerBuilt === '1') return;
  writeup.dataset.flowerBuilt = '1';
  writeup.classList.add('writeup--flower');

  const activeRow = Math.floor(cellIndex / 3);
  const activeCol = cellIndex % 3;
  const positions: Array<[number, number]> = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === activeRow && c === activeCol) continue;
      positions.push([r, c]);
    }
  }

  const desc = writeup.querySelector<HTMLElement>('.project-desc');
  const bodyEl = writeup.querySelector<HTMLElement>('.project-body');
  const bodyChildren = bodyEl ? (Array.from(bodyEl.children) as HTMLElement[]) : [];
  const petals = [desc, ...bodyChildren].filter((el): el is HTMLElement => !!el);

  petals.forEach((petal, i) => {
    petal.classList.add('petal');
    if (i < positions.length) {
      const [r, c] = positions[i];
      petal.style.gridRow = String(r + 1);
      petal.style.gridColumn = String(c + 1);
      writeup.appendChild(petal); // direct child of the grid so placement applies
    } else {
      petal.style.display = 'none'; // safety net: more copy than free cells
    }
  });
  bodyEl?.remove();
}

/* ── Open / close a project in place ─────────────────────────────────────── */
let stage: HTMLElement | null = null;
let openId: string | null = null;
let typingCancel: (() => void) | null = null;

function visibleTiles(): HTMLElement[] {
  const page = stage!.dataset.page ?? '1';
  return Array.from(stage!.querySelectorAll<HTMLElement>(`.tile[data-page="${page}"]`));
}

async function openProject(cell: HTMLElement, id: string): Promise<void> {
  if (openId || !stage) return;
  openId = id;
  stage.classList.add('is-open');
  cell.classList.add('cell--active');

  // Dissolve every visible tile except the one in the active cell
  const others = visibleTiles().filter((t) => !cell.contains(t));
  await Promise.all(others.map(dissolve));

  // Reveal the writeup, "flowered" around the persisting tile
  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (!writeup) return;
  const gridEl = stage.querySelector<HTMLElement>('.landing-grid')!;
  const cellIndex = Array.from(gridEl.children).indexOf(cell);
  layoutFlower(writeup, cellIndex);

  writeup.hidden = false;
  initCarousels(writeup);
  // Type each petal in, like the old keycaps page
  typingCancel?.();
  typingCancel = typeInto(writeup, 40, 16);
}

async function closeProject(): Promise<void> {
  if (!openId || !stage) return;
  const id = openId;
  openId = null;
  typingCancel?.();

  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (writeup) writeup.hidden = true;

  const cell = stage.querySelector<HTMLElement>('.cell--active');
  cell?.classList.remove('cell--active');

  // Reveal the tiles that were dissolved
  const others = visibleTiles().filter((t) => !cell?.contains(t));
  await Promise.all(others.map(reveal));
  stage.classList.remove('is-open');
}

/* ── "More works" pager ──────────────────────────────────────────────────── */
let paging = false;
async function setPage(page: '1' | '2'): Promise<void> {
  if (!stage || paging || stage.dataset.page === page) return;
  paging = true;
  // Dissolve the four swapping tiles only — the name/about and "more works"
  // tiles persist unchanged across pages and shouldn't flicker.
  const leaving = visibleTiles().filter((t) => !t.classList.contains('tile--persist'));
  await Promise.all(leaving.map(dissolve));
  stage.dataset.page = page;
  // New tiles start covered, then reveal
  const entering = visibleTiles().filter((t) => !t.classList.contains('tile--persist'));
  await Promise.all(entering.map((t) => pixelate(t, true, true))); // cover instantly
  await Promise.all(entering.map(reveal));
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
    if (cell) openProject(cell, tile.dataset.open);
  }
}

/* ── Init + load-in animation ────────────────────────────────────────────── */
function init(): void {
  stage = document.querySelector<HTMLElement>('.stage');
  if (!stage) return;

  // Slice animation: split every tile title into word-halves
  stage.querySelectorAll<HTMLElement>('.tile-name, .tile-label, .tile-namecard-name')
    .forEach(buildSplitWords);

  // Hover typing on photo tiles
  stage.querySelectorAll<HTMLElement>('.tile--photo').forEach(initHover);

  stage.addEventListener('click', onStageClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (lightboxOpen) closeLightbox(); else if (openId) closeProject(); }
  });

  // Load-in: cover every visible tile instantly, reveal the page, then clear
  // the pixels (reverse of the dissolve) so tiles assemble rather than flick in.
  const tiles = visibleTiles();
  Promise.all(tiles.map((t) => pixelate(t, true, true))).then(() => {
    stage!.classList.add('ready');
    setTimeout(() => tiles.forEach(reveal), 60);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
