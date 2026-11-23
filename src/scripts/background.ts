/* ============================================================================
   Page background — a slowly drifting, dithered pixel-cloud texture in place
   of the flat off-white. Chosen in /lab2 as "C07 dithered 4px · greys ·
   4 levels · 16 steps/s · speed 0.20× · strength 100% · size 1.00× · no grain".

   A WebGL fragment shader draws the clouds into a small offscreen canvas — one
   texel per 4px block, covering the stretch of page around what's on screen —
   which is exported as an image (a BMP per animation step, a PNG when it must
   show at once — see step() and drawNow()) and painted (pixelated) onto every
   surface that used to show --bg. It's set on the page, not the screen: each surface's
   background is offset by where that surface sits on its page (the document,
   or an open write-up, which scrolls inside itself), so the texture scrolls
   natively with the content. (No `background-attachment: fixed` — iOS ignores
   it.)

   Buttons that fill red on hover keep their fill (CSS drops the texture
   then); the see-through text boxes show the card's texture behind them. With
   animations off (the toggle, or prefers-reduced-motion) the texture holds
   still. Without WebGL the site simply keeps its flat background.
   ========================================================================== */

const PX = 4; // block size, CSS px
const FPS = 16; // steps per second while animating
const SPEED = 0.2; // drift speed (1 = the lab's default)
const UNIT = 640; // CSS px per noise unit — the cloud size picked in the lab
const MARGIN = 0.75; // screens of texture drawn beyond each edge of the view

// Everything that showed the flat off-white (and the description panel's
// white). The red-filling buttons and the animations toggle swap the texture
// for their fill on hover / while on — see global.css.
const SURFACES = [
  'html', 'body', '.tile--contact', '.tile--photo', '.tile--photo .tile-media', '.tile--about',
  '.more-tile--photo', '.more-tile--photo .tile-media', '.writeup', '.writeup-bar', '.essay-tile',
  '.nav-desc', '.nav-essays', '.essay-back', '.nav-mini--anim',
].join(', ');

const FRAGMENT = `
  precision highp float;
  uniform vec2 uRes;      // canvas size, texels
  uniform float uRowOff;  // page row (in blocks) of the canvas's top row
  uniform float uT;       // time, already scaled by SPEED
  uniform bool uBgr;      // write blue-green-red, the byte order a BMP wants
  const float SCALE = ${(PX / UNIT).toFixed(6)};
  const vec3 F = vec3(0.98);                   // --bg, #fafafa
  const vec3 MID = vec3(0.958, 0.956, 0.950);
  const vec3 DEEP = vec3(0.938, 0.935, 0.927);
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
  void main() {
    // The block this texel paints, in page coordinates (so dither and clouds
    // stay put on the page as the drawn window moves).
    vec2 cell = floor(vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y)) + vec2(0.0, uRowOff);
    vec2 p = (cell + 0.5) * SCALE;
    // Cloud value → 4 levels, with an ordered dither between neighbouring levels.
    float b = smoothstep(0.40, 0.68, fbm(vec3(p * 2.2 + vec2(uT * 0.015, 0.0), uT * 0.01))) * 4.0;
    float k = min(floor(b) + (fract(b) > bayer8(cell) ? 1.0 : 0.0), 3.0) / 3.0;
    vec3 c = k < 0.5 ? mix(F, MID, k * 2.0) : mix(MID, DEEP, k * 2.0 - 1.0);
    gl_FragColor = vec4(uBgr ? c.bgr : c, 1.0);
  }`;

function setup(): void {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return;
  const shader = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }');
  const fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one full-screen triangle
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uRowOff = gl.getUniformLocation(prog, 'uRowOff');
  const uT = gl.getUniformLocation(prog, 'uT');
  const uBgr = gl.getUniformLocation(prog, 'uBgr');

  const root = document.documentElement;
  const surfaces = [...document.querySelectorAll<HTMLElement>(SURFACES)];
  surfaces.forEach((el) => el.classList.add('bg-surface'));
  root.classList.add('bg-texture');

  const scrolling = (): HTMLElement => (document.scrollingElement as HTMLElement) ?? root;
  const openWriteups = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.writeup:not([hidden])')];
  const animated = (): boolean => !root.classList.contains('reduce-motion');
  // Time keeps running across page loads (the project pages are separate
  // documents), wrapping every ~14 hours so the shader's floats stay precise.
  const now = (): number => ((Date.now() / 1000) * SPEED) % 10000;
  let frozenAt = now();
  let covered = { start: 0, end: 0 };

  /* Each surface's offset on its page: the document, or — inside an open
     write-up — that write-up's scrolling content. A write-up's own background
     uses `background-attachment: local`, so it needs no offset at all. */
  function place(): void {
    for (const el of surfaces) {
      if (el === root || el === document.body || el.classList.contains('writeup')) continue;
      if (!el.getClientRects().length) continue; // hidden — placed when shown
      const r = el.getBoundingClientRect();
      const page = el.parentElement?.closest<HTMLElement>('.writeup');
      let x = r.left + window.scrollX, y = r.top + window.scrollY;
      if (page) {
        const p = page.getBoundingClientRect();
        x = r.left - (p.left + page.clientLeft) + page.scrollLeft;
        y = r.top - (p.top + page.clientTop) + page.scrollTop;
      }
      const tx = String(Math.round(x)), ty = String(Math.round(y));
      if (el.style.getPropertyValue('--tx') !== tx) el.style.setProperty('--tx', tx);
      if (el.style.getPropertyValue('--ty') !== ty) el.style.setProperty('--ty', ty);
    }
  }

  // The stretch of page to draw: the view of every visible scroller (the
  // document, plus any open write-up) with a margin either side. If they're
  // far apart, the open write-up wins — the grid is hidden behind it.
  function range(): [number, number] {
    const vh = window.innerHeight, m = vh * MARGIN;
    const views = [scrolling(), ...openWriteups()].map((s) => [s.scrollTop - m, s.scrollTop + vh + m]);
    let from = Math.min(...views.map((v) => v[0])), to = Math.max(...views.map((v) => v[1]));
    if (to - from > vh * 4) [from, to] = views[views.length - 1];
    return [Math.max(0, from), to];
  }

  // Renders the clouds for the stretch of page around the view into the
  // (offscreen) canvas, and says which stretch that is.
  type Stretch = { start: number; end: number; size: string; cols: number; rows: number };
  function render(bgr = false): Stretch | null {
    const [from, to] = range();
    const start = Math.floor(from / PX) * PX;
    const cols = Math.ceil(root.clientWidth / PX), rows = Math.ceil((to - start) / PX);
    if (!cols || rows <= 0) return null;
    if (canvas.width !== cols || canvas.height !== rows) { canvas.width = cols; canvas.height = rows; }
    gl!.viewport(0, 0, cols, rows);
    gl!.uniform2f(uRes, cols, rows);
    gl!.uniform1f(uRowOff, start / PX);
    gl!.uniform1f(uT, (animated() ? now() : frozenAt) + 40);
    gl!.uniform1i(uBgr, bgr ? 1 : 0);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    return { start, end: start + rows * PX, size: `${cols * PX}px ${rows * PX}px`, cols, rows };
  }

  // The canvas as an uncompressed 32-bit BMP. There's nothing to encode, so
  // making it costs only the GPU read-back (~1 ms). Rows run bottom-up in both
  // a BMP and readPixels, so they go in as they come; render(true) has already
  // written each pixel's channels in BMP's blue-green-red order.
  let pixels = new Uint8Array(0);
  function bmp({ cols, rows }: Stretch): Blob {
    const size = cols * rows * 4;
    if (pixels.length !== size) pixels = new Uint8Array(size);
    gl!.readPixels(0, 0, cols, rows, gl!.RGBA, gl!.UNSIGNED_BYTE, pixels);
    const head = new DataView(new ArrayBuffer(54));
    head.setUint16(0, 0x4d42, true); // "BM"
    head.setUint32(2, 54 + size, true); // file size
    head.setUint32(10, 54, true); // where the pixels start
    head.setUint32(14, 40, true); // BITMAPINFOHEADER
    head.setInt32(18, cols, true);
    head.setInt32(22, rows, true); // positive: bottom-up
    head.setUint16(26, 1, true); // planes
    head.setUint16(28, 32, true); // bits per pixel (compression 0: none)
    head.setUint32(34, size, true);
    return new Blob([head.buffer, pixels], { type: 'image/bmp' });
  }

  // Puts a rendered texture on every surface. Set on the surfaces themselves
  // (non-inherited — see global.css), so only they restyle, not the page.
  function show(url: string, s: Stretch): void {
    const props: [string, string][] = [['--tex', `url("${url}")`], ['--tex-size', s.size], ['--tex-top', String(s.start)]];
    for (const el of surfaces) {
      for (const [k, v] of props) if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v);
    }
    covered = { start: s.start, end: s.end };
  }

  // Draws and shows a texture in this same frame, as a PNG data: URL (which,
  // unlike a blob: URL, the page can paint without waiting for it to load).
  // For when the view has just moved past the drawn stretch, or the window
  // has resized. It's the slow way — the PNG is encoded here and then, being
  // ~100 KB of text, parsed into every surface's style — so it's kept for
  // those moments.
  let shownGen = 0; // bumped by every draw; a step that's overtaken is dropped
  function drawNow(): void {
    const s = render();
    if (!s) return;
    shownGen++;
    show(canvas.toDataURL(), s);
  }

  // An animation step, 16 a second: the frame goes over as a BMP behind a
  // short blob: URL. It's loaded before it's swapped in, so the surfaces can
  // paint it straight away (no blank frame), and each step costs the page
  // ~3 ms rather than ~25 — little enough not to hold up the frames the home
  // bar's scrolling name needs. (Not canvas.toBlob: Chrome only encodes that
  // PNG in idle time, which here took about a second per step. And it waits
  // for `load`, not img.decode(), which only settles once frames are drawn.)
  let inFlight: { gen: number; at: number } | null = null;
  const held: { url: string; img: HTMLImageElement }[] = [];
  function step(): void {
    // One step at a time: if the last is still loading, skip this beat (a
    // step stuck for a whole second is given up on).
    if (inFlight && performance.now() - inFlight.at < 1000) return;
    const s = render(true);
    if (!s) return;
    const mine = { gen: ++shownGen, at: performance.now() };
    inFlight = mine;
    const url = URL.createObjectURL(bmp(s));
    const img = new Image();
    img.onload = img.onerror = (e) => {
      if (inFlight === mine) inFlight = null;
      // Failed, or a newer draw got there first.
      if ((e as Event).type === 'error' || mine.gen !== shownGen) { URL.revokeObjectURL(url); return; }
      show(url, s);
      // Hold on to this image and the one it replaced (surfaces may still be
      // painting it until their restyle); free anything older.
      held.push({ url, img });
      while (held.length > 2) URL.revokeObjectURL(held.shift()!.url);
      cover(); // in case the view ran past this stretch while it loaded
    };
    img.src = url;
  }

  // Redraw only if something on screen has scrolled outside the drawn stretch.
  function cover(): void {
    const vh = window.innerHeight;
    const out = [scrolling(), ...openWriteups()].some((s) => s.scrollTop < covered.start || s.scrollTop + vh > covered.end);
    if (out) drawNow();
  }

  // The animation loop. It stops itself when animations are switched off (the
  // texture then holds still; scrolling and views still keep it placed and
  // covered) and is restarted by the class observer below when they're back.
  let running = false;
  function tick(): void {
    running = animated();
    if (!running) return;
    setTimeout(tick, 1000 / FPS);
    if (document.hidden) return;
    place();
    step();
  }

  document.addEventListener('scroll', () => { place(); cover(); }, { capture: true, passive: true });
  addEventListener('resize', () => { place(); drawNow(); });
  // A view opening or closing unhides / hides its write-up.
  new MutationObserver(() => requestAnimationFrame(() => { place(); cover(); }))
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // html.view-open and the animations toggle (html.reduce-motion). Switching
  // animations off just freezes the clock — the texture on screen is the
  // latest step already, so there's nothing to redraw.
  new MutationObserver(() => {
    if (!animated()) frozenAt = now();
    else if (!running) tick();
    place();
    cover();
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  place();
  drawNow();
  tick();
}

setup();
