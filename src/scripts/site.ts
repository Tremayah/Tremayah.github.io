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

/* ── Article layout: text flows around an embedded photo ──────────────────
   Replaces the old "flower/petals" grid. The writeup becomes a single
   flowing column (magazine-style): the lead description sits above the
   body copy, and the project's cover photo is floated inside the body with
   a caption, so the justified text wraps around it like printed copy. Built
   once per writeup and cached. */
function layoutArticle(writeup: HTMLElement): void {
  if (writeup.dataset.articleBuilt === '1') return;
  writeup.dataset.articleBuilt = '1';
  writeup.classList.add('writeup--article');

  const cover = writeup.dataset.cover;
  const bodyEl = writeup.querySelector<HTMLElement>('.project-body');
  if (!cover || !bodyEl) return;

  const figure = document.createElement('figure');
  figure.className = 'article-figure';
  const img = document.createElement('img');
  img.className = 'article-img';
  img.src = cover;
  img.alt = '';
  img.loading = 'lazy';
  const caption = document.createElement('figcaption');
  caption.className = 'article-caption';
  caption.textContent = writeup.dataset.title ?? '';
  figure.append(img, caption);

  // Drop the figure into the body so the surrounding paragraphs reflow
  // around it — first paragraph leads, the photo floats alongside the rest.
  const firstPara = bodyEl.querySelector('p');
  if (firstPara) firstPara.after(figure);
  else bodyEl.prepend(figure);
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
  // Brief glitch feedback on the clicked tile's title — it dissolves with
  // everything else a moment later, but the slice/colour flash reads as
  // the "open" trigger before the article takes over the whole stage.
  cell.classList.add('cell--active');

  // Dissolve every visible tile, including the one that was clicked — the
  // article now fills the whole stage rather than flowering around a tile.
  const tiles = visibleTiles();
  await Promise.all(tiles.map(dissolve));

  const writeup = stage.querySelector<HTMLElement>(`.writeup[data-for="${id}"]`);
  if (!writeup) return;
  layoutArticle(writeup);

  writeup.hidden = false;
  initCarousels(writeup);
  // Type the article in, like the old keycaps page
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

  stage.querySelector('.cell--active')?.classList.remove('cell--active');

  // Reveal every tile that was dissolved on open
  const tiles = visibleTiles();
  await Promise.all(tiles.map(reveal));
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
