/* ============================================================================
   Client behaviours for the portfolio.

   Loaded once by SiteLayout.astro. The site uses Astro's <ClientRouter />, so
   navigation swaps the page without a full reload. Two kinds of setup:

     • bind-once   — global listeners on `document` and on persistent nodes
                     (lightbox, marquee, dev tools). Registered a single time.
     • per-page    — work that must repeat on every navigation (typing reveal,
                     active-nav highlight, scroll reset). Runs on each
                     `astro:page-load`, which also fires on the initial load.
   ========================================================================== */

import { navigate } from 'astro:transitions/client';

/* ── helpers ─────────────────────────────────────────────────────────── */
const normalizePath = (p: string): string => {
  const s = p.replace(/\/+$/, '');
  return s === '' ? '/' : s;
};

/* ── Typing reveal (per project page) ────────────────────────────────── */
let typingTimer: ReturnType<typeof setInterval> | null = null;

function cancelTyping(): void {
  if (typingTimer !== null) { clearInterval(typingTimer); typingTimer = null; }
}

function runTyping(container: HTMLElement): void {
  cancelTyping();

  // Replace every character in every text node with a hidden <span>, then
  // fade them in a chunk at a time.
  const chars: HTMLElement[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text) return;
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        const span = document.createElement('span');
        span.textContent = ch;
        span.style.opacity = '0';
        chars.push(span);
        frag.appendChild(span);
      }
      node.parentNode?.replaceChild(frag, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Skip image containers — wrapping their whitespace text nodes in spans
      // would create stray grid/slide items and break the layout.
      const cls = (node as Element).classList;
      if (
        cls?.contains('img-grid') ||
        cls?.contains('hero-pair') ||
        cls?.contains('hero-trio') ||
        cls?.contains('carousel')
      ) return;
      Array.from(node.childNodes).forEach(walk);
    }
  };
  walk(container);

  let idx = 0;
  const CHUNK = 40; // chars revealed per tick (~2400 chars/s at 60fps)
  const TICK = 16;  // ms
  typingTimer = setInterval(() => {
    for (let i = 0; i < CHUNK && idx < chars.length; i++, idx++) {
      chars[idx].style.opacity = '1';
    }
    if (idx >= chars.length) cancelTyping();
  }, TICK);
}

/* ── Word-split nav animation (built once on the persistent nav) ──────── */
function buildSplitWords(nameEl: HTMLElement): void {
  const text = nameEl.textContent?.trim() ?? '';
  nameEl.textContent = '';
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
    nameEl.appendChild(wrap);
    if (i < words.length - 1) nameEl.appendChild(document.createTextNode(' '));
  });
}

function buildNav(): void {
  document.querySelectorAll<HTMLElement>('.item-name').forEach((el) => {
    if (el.dataset.split) return; // already built (the nav persists)
    buildSplitWords(el);
    el.dataset.split = '1';
  });
}

/* ── Active nav highlight (per page) ─────────────────────────────────── */
function updateActiveNav(): void {
  const here = normalizePath(location.pathname);
  document.querySelectorAll<HTMLAnchorElement>('.item-trigger').forEach((a) => {
    const href = normalizePath(new URL(a.href).pathname);
    if (href === here) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ── Reset the inner scroll container on each navigation ─────────────── */
function resetScroll(): void {
  document.querySelector('.content-col')?.scrollTo({ top: 0 });
}

/* ── Carousels (per page) ────────────────────────────────────────────────
   Turns each <div class="carousel"><img/>…</div> into a one-at-a-time
   scroll-snap slider with prev/next buttons and a counter. Idempotent: a
   carousel is only enhanced once (guarded by data-car-init). */
function initCarousels(): void {
  document.querySelectorAll<HTMLElement>('.carousel').forEach((car) => {
    if (car.dataset.carInit) return;
    const imgs = Array.from(car.querySelectorAll<HTMLImageElement>(':scope > img'));
    if (imgs.length === 0) return;
    car.dataset.carInit = '1';

    // Move the images into a scroll-snap track
    const track = document.createElement('div');
    track.className = 'carousel-track';
    imgs.forEach((img) => {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.appendChild(img);
      track.appendChild(slide);
    });
    car.appendChild(track);

    const mkBtn = (cls: string, label: string, glyph: string): HTMLButtonElement => {
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
    const setCounter = () => { counter.textContent = `${idx + 1} / ${imgs.length}`; };
    const go = (i: number) => {
      idx = (i + imgs.length) % imgs.length;
      track.scrollTo({ left: track.clientWidth * idx, behavior: 'smooth' });
      setCounter();
    };
    prev.addEventListener('click', () => go(idx - 1));
    next.addEventListener('click', () => go(idx + 1));

    // Keep the counter in sync when the user swipes/scrolls manually
    let raf = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== idx) { idx = i; setCounter(); }
      });
    });
  });
}

/* ── Lightbox (bound once) ───────────────────────────────────────────── */
function openLightbox(img: HTMLImageElement): void {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox?.querySelector('.lightbox-img') as HTMLImageElement | null;
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = img.src;
  lightboxImg.alt = img.alt;
  lightbox.removeAttribute('hidden');
  lightbox.classList.remove('lb-out');
  lightbox.classList.add('lb-open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(): void {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  lightbox.classList.remove('lb-open');
  lightbox.classList.add('lb-out');
  lightbox.addEventListener('animationend', () => {
    lightbox.setAttribute('hidden', '');
    lightbox.classList.remove('lb-out');
    document.body.style.overflow = '';
  }, { once: true });
}

function bindLightbox(): void {
  document.addEventListener('click', (e) => {
    const el = e.target as Element;
    if (el.tagName === 'IMG' && el.closest('.project-body')) {
      openLightbox(el as HTMLImageElement);
      return;
    }
    const lightbox = document.getElementById('lightbox');
    if (e.target === lightbox || lightbox?.contains(e.target as Node)) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox');
    if (e.key === 'Escape' && lightbox && !lightbox.hasAttribute('hidden')) closeLightbox();
  });
}

/* ── Marquee (bound once; the node persists across pages) ────────────── */
function bindMarquee(): void {
  const marquee = document.querySelector<HTMLElement>('.marquee-vert');
  const track = document.querySelector<HTMLElement>('.marquee-track');
  if (!marquee || !track) return;

  marquee.addEventListener('mouseenter', () => {
    const currentY = new DOMMatrix(getComputedStyle(track).transform).m42;
    track.style.animation = 'none';
    track.style.transform = `translateY(${currentY}px)`;
    void track.offsetHeight;
    // Snap R to the bottom of the viewport (+3rem corrects for padding below R)
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const startY = -(track.scrollHeight * 0.75) + window.innerHeight + 3 * rem;
    track.style.transition = 'transform 1s cubic-bezier(0.25,0.46,0.45,0.94)';
    track.style.transform = `translateY(${startY}px)`;
  });

  marquee.addEventListener('mouseleave', () => {
    const currentY = new DOMMatrix(getComputedStyle(track).transform).m42;
    const totalH = track.scrollHeight;
    const vh = window.innerHeight;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const fromY = -(totalH * 0.75) + vh + 3 * rem;
    const rangeH = totalH * 0.5;
    const elapsed = (currentY - fromY) / rangeH * 140;
    const delay = -((elapsed % 140 + 140) % 140);
    track.style.transition = 'none';
    track.style.transform = `translateY(${currentY}px)`;
    void track.offsetHeight;
    track.style.animation = `march-down 140s linear ${delay.toFixed(3)}s infinite`;
    void track.offsetHeight;
    track.style.transform = '';
  });

  // Clicking the marquee jumps to the About page (same as the old panel toggle).
  marquee.addEventListener('click', () => { navigate('/about/'); });
}

/* ── Click the active nav item again → return to the landing page ────── */
function bindNavToggleHome(): void {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('.item-trigger') as HTMLAnchorElement | null;
    if (!a) return;
    if (normalizePath(new URL(a.href).pathname) === normalizePath(location.pathname)) {
      // Already here → behave like the old "click to close" and go home.
      e.preventDefault();
      e.stopPropagation();
      navigate('/');
    }
  }, true); // capture phase, so it runs before the ClientRouter's own handler
}

/* ── Dev tools: font pickers + landing drag (persisted; bound once) ──── */
function bindDevTools(): void {
  const root = document.documentElement;

  const applyFont = (inputId: string, prop: string): void => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (!el) return;
    const apply = () => {
      const val = el.value.trim();
      if (val) root.style.setProperty(prop, `'${val}', sans-serif`);
    };
    el.addEventListener('change', apply);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  };
  applyFont('pick-nav-font', '--nav-font');
  applyFont('pick-body-font', '--body-font');
  applyFont('pick-dropcap-font', '--dropcap-font');
  applyFont('pick-marquee-font', '--marquee-font');

  const toggleBtn = document.getElementById('drag-toggle') as HTMLButtonElement | null;
  const readout = document.getElementById('drag-readout');
  if (!toggleBtn || !readout) return;

  let enabled = false;
  const state = new Map<HTMLElement, { ox: number; oy: number }>();

  const currentEls = (): HTMLElement[] =>
    ['.landing-girl', '.landing-name', '.landing-sub']
      .map((sel) => document.querySelector<HTMLElement>(sel))
      .filter((el): el is HTMLElement => el !== null);

  const fmt = (el: HTMLElement, label: string, col: DOMRect): string => {
    const r = el.getBoundingClientRect();
    const cx = ((r.left + r.width / 2 - col.left) / col.width * 100).toFixed(1);
    const cy = ((r.top + r.height / 2) / window.innerHeight * 100).toFixed(1);
    return `${label}  cx:${cx}%  cy:${cy}%`;
  };

  const labels = ['girl', 'name', 'sub'];
  const updateReadout = (): void => {
    const colEl = document.querySelector('.content-col');
    const els = currentEls();
    if (!colEl || els.length === 0) { readout.textContent = 'no landing on this page'; return; }
    const col = colEl.getBoundingClientRect();
    readout.textContent = els.map((el, i) => fmt(el, labels[i], col)).join('     ');
  };

  const attachDrag = (el: HTMLElement): void => {
    if (el.dataset.dragBound) return; // bind each (possibly new) node only once
    el.dataset.dragBound = '1';
    el.addEventListener('mousedown', (e) => {
      if (!enabled) return;
      e.preventDefault();
      const cur = state.get(el) ?? { ox: 0, oy: 0 };
      const startX = e.clientX - cur.ox;
      const startY = e.clientY - cur.oy;
      el.style.cursor = 'grabbing';
      const onMove = (ev: MouseEvent) => {
        const ox = ev.clientX - startX;
        const oy = ev.clientY - startY;
        state.set(el, { ox, oy });
        el.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
        updateReadout();
      };
      const onUp = () => {
        el.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  };

  toggleBtn.addEventListener('click', () => {
    enabled = !enabled;
    toggleBtn.classList.toggle('active', enabled);
    toggleBtn.textContent = enabled ? '⠿ drag ON' : '⠿ drag mode';
    const els = currentEls();
    if (enabled) {
      els.forEach(attachDrag);
      els.forEach((el) => el.classList.add('drag-active'));
      updateReadout();
    } else {
      els.forEach((el) => {
        el.classList.remove('drag-active');
        el.style.transform = 'translate(-50%, -50%)';
      });
      state.clear();
      readout.textContent = 'off';
    }
  });
}

/* ── Landing tiles: type the overview on hover (per page) ─────────────────
   On the landing grid, hovering a tile pales its image (CSS) and types the
   project overview over it. The text starts empty and is revealed character
   by character on mouseenter; mouseleave clears it so it re-types next time. */
function initLandingTiles(): void {
  document.querySelectorAll<HTMLElement>('.tile').forEach((tile) => {
    if (tile.dataset.tileInit) return;
    tile.dataset.tileInit = '1';

    const media    = tile.querySelector<HTMLElement>('.tile-media');
    const overview = tile.querySelector<HTMLElement>('.tile-overview');
    if (!media || !overview) return;

    const fullText = (overview.textContent ?? '').trim();
    overview.textContent = ''; // start empty; CSS fades the container in on hover

    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };

    media.addEventListener('mouseenter', () => {
      stop();
      overview.textContent = '';
      const spans: HTMLElement[] = [];
      const frag = document.createDocumentFragment();
      for (const ch of fullText) {
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.opacity = '0';
        spans.push(s);
        frag.appendChild(s);
      }
      overview.appendChild(frag);

      let idx = 0;
      const CHUNK = 2;  // chars per tick — slower, visible typewriter
      const TICK = 18;  // ms → ~110 chars/s
      timer = setInterval(() => {
        for (let i = 0; i < CHUNK && idx < spans.length; i++, idx++) spans[idx].style.opacity = '1';
        if (idx >= spans.length) stop();
      }, TICK);
    });

    media.addEventListener('mouseleave', () => {
      stop();
      overview.textContent = ''; // reset for next hover
    });
  });
}

/* ── Lifecycle ───────────────────────────────────────────────────────── */
let boundOnce = false;

function onPageLoad(): void {
  if (!boundOnce) {
    bindLightbox();
    bindMarquee();
    bindNavToggleHome();
    bindDevTools();
    boundOnce = true;
  }
  buildNav();
  updateActiveNav();
  resetScroll();
  // Typing reveal runs on whichever content the page has: a project's full
  // report (description + body) or the About/Contact prose. The landing grid
  // has neither — its tiles type their overview on hover instead.
  const typeTarget = document.querySelector<HTMLElement>('.project-report, .prose-area');
  if (typeTarget) runTyping(typeTarget);
  initCarousels();
  initLandingTiles();
}

// Fires on the initial load and after every <ClientRouter /> navigation.
document.addEventListener('astro:page-load', onPageLoad);
