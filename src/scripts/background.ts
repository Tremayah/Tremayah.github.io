/* ============================================================================
   Page background — a slowly drifting, dithered pixel-cloud texture in place
   of the flat off-white. Chosen in /lab2 as "C07 dithered 4px · greys ·
   4 levels · 16 steps/s · speed 0.20× · strength 100% · size 1.00× · no grain".

   A WebGL fragment shader draws the clouds into a small offscreen canvas — one
   texel per 4px block, covering the stretch of page around what's on screen —
   which is exported as a PNG and painted (pixelated) onto every surface that
   used to show --bg. It's set on the page, not the screen: each surface's
   background is offset by where that surface sits on its page (the document,
   or an open write-up, which scrolls inside itself), so the texture scrolls
   natively with the content. (No `background-attachment: fixed` — iOS ignores
   it.)

   Buttons and text boxes stay flat off-white. With animations off (the toggle,
   or prefers-reduced-motion) the texture holds still. Without WebGL the site
   simply keeps its flat background.
   ========================================================================== */

const PX = 4; // block size, CSS px
const FPS = 16; // steps per second while animating
const SPEED = 0.2; // drift speed (1 = the lab's default)
const UNIT = 640; // CSS px per noise unit — the cloud size picked in the lab
const MARGIN = 0.75; // screens of texture drawn beyond each edge of the view

// Everything that showed the flat off-white, minus buttons and text boxes. The
// essay tiles are buttons, but read as cards; they still fill red on hover (CSS).
const SURFACES = [
  'html', 'body', '.tile--contact', '.tile--photo', '.tile--photo .tile-media', '.tile--about',
  '.more-tile--photo', '.more-tile--photo .tile-media', '.writeup', '.writeup-bar', '.essay-tile',
].join(', ');

const FRAGMENT = `
  precision highp float;
  uniform vec2 uRes;      // canvas size, texels
  uniform float uRowOff;  // page row (in blocks) of the canvas's top row
  uniform float uT;       // time, already scaled by SPEED
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
    gl_FragColor = vec4(k < 0.5 ? mix(F, MID, k * 2.0) : mix(MID, DEEP, k * 2.0 - 1.0), 1.0);
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

  function draw(): void {
    const [from, to] = range();
    const start = Math.floor(from / PX) * PX;
    const cols = Math.ceil(root.clientWidth / PX), rows = Math.ceil((to - start) / PX);
    if (!cols || rows <= 0) return;
    if (canvas.width !== cols || canvas.height !== rows) { canvas.width = cols; canvas.height = rows; }
    gl!.viewport(0, 0, cols, rows);
    gl!.uniform2f(uRes, cols, rows);
    gl!.uniform1f(uRowOff, start / PX);
    gl!.uniform1f(uT, (animated() ? now() : frozenAt) + 40);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    root.style.setProperty('--tex', `url("${canvas.toDataURL()}")`);
    root.style.setProperty('--tex-size', `${cols * PX}px ${rows * PX}px`);
    root.style.setProperty('--tex-top', String(start));
    covered = { start, end: start + rows * PX };
  }

  // Redraw only if something on screen has scrolled outside the drawn stretch.
  function cover(): void {
    const vh = window.innerHeight;
    const out = [scrolling(), ...openWriteups()].some((s) => s.scrollTop < covered.start || s.scrollTop + vh > covered.end);
    if (out) draw();
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
    draw();
  }

  document.addEventListener('scroll', () => { place(); cover(); }, { capture: true, passive: true });
  addEventListener('resize', () => { place(); draw(); });
  // A view opening or closing unhides / hides its write-up.
  new MutationObserver(() => requestAnimationFrame(() => { place(); cover(); }))
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // html.view-open and the animations toggle (html.reduce-motion).
  new MutationObserver(() => {
    if (!animated()) frozenAt = now();
    else if (!running) tick();
    place();
    draw();
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  place();
  draw();
  tick();
}

setup();
