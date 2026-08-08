/**
 * The cursor field: a proximity effect, not a hover state.
 *
 * One module-scope singleton owns a single requestAnimationFrame loop that
 * reads the pointer and writes styles for every registered element. React
 * never re-renders during the animation, which is the whole point: a hundred
 * letters thickening as the pointer passes must not touch the component tree.
 *
 * Geometry is cached in DOCUMENT coordinates, so scrolling costs nothing. Any
 * change that moves things without firing a resize (a panel opening, a route
 * transition, a list re-rendering) has to call refresh().
 *
 * Written from the written spec in the "16 · Cursor field + nav dropdowns"
 * handoff. The four source files that handoff refers to were not present in
 * any uploaded bundle, so the numbers below come from its motion table and
 * every structural decision from its "Things that will bite" section. It is
 * meant to be replaced wholesale if the original turns up.
 */

export type CursorTextMode = "chars" | "ink";

/** Motion constants. All of these are from the handoff's motion table. */
const RADIUS = 105;
const RADIUS_SQ = RADIUS * RADIUS;
const LIFT = { chars: -4.2, ink: -2.6 } as const;
const WEIGHT_GAIN = 260; // chars only; ink never touches weight
const MAGNET_REACH = 130; // plus half the element's width
const MAGNET_CAP_X = 7;
const MAGNET_CAP_Y = 5;
const EASE = 0.2; // per frame toward target, so every value decays to rest
const REST = 0.0015; // below this an entry is at rest and stops being written

type CharTarget = {
  el: HTMLElement;
  mode: CursorTextMode;
  chars: HTMLElement[];
  cx: Float64Array;
  cy: Float64Array;
  base: Float64Array; // resting font-weight per character
  cur: Float64Array; // eased intensity, 0 at rest
  live: boolean; // was anything written last frame
};

type MagnetTarget = {
  el: HTMLElement;
  cx: number;
  cy: number;
  reach: number;
  curX: number;
  curY: number;
  live: boolean;
};

type GlowTarget = {
  el: HTMLElement;
  left: number;
  top: number;
  w: number;
  h: number;
  on: boolean;
};

const charTargets = new Set<CharTarget>();
const magnetTargets = new Set<MagnetTarget>();
const glowTargets = new Set<GlowTarget>();

let px = -9999; // pointer, document coordinates
let py = -9999;
let running = false;
let frame = 0;
let listening = false;
let reduced = false;

function prefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Document-space centre of a rect, independent of scroll position. */
function centre(el: HTMLElement): { x: number; y: number; w: number; h: number; l: number; t: number } {
  const r = el.getBoundingClientRect();
  const l = r.left + window.scrollX;
  const t = r.top + window.scrollY;
  return { x: l + r.width / 2, y: t + r.height / 2, w: r.width, h: r.height, l, t };
}

function measureChars(t: CharTarget) {
  for (let i = 0; i < t.chars.length; i++) {
    const c = centre(t.chars[i]);
    t.cx[i] = c.x;
    t.cy[i] = c.y;
  }
}

function measureMagnet(t: MagnetTarget) {
  const c = centre(t.el);
  t.cx = c.x;
  t.cy = c.y;
  t.reach = MAGNET_REACH + c.w / 2;
}

function measureGlow(t: GlowTarget) {
  const c = centre(t.el);
  t.left = c.l;
  t.top = c.t;
  t.w = c.w;
  t.h = c.h;
}

/** Re-measure everything. Call after any layout change that has no resize. */
export function refresh(): void {
  if (typeof window === "undefined") return;
  charTargets.forEach(measureChars);
  magnetTargets.forEach(measureMagnet);
  glowTargets.forEach(measureGlow);
}

function tick() {
  frame = 0;
  let active = false;

  for (const t of charTargets) {
    const lift = LIFT[t.mode];
    let live = false;
    for (let i = 0; i < t.chars.length; i++) {
      const dx = px - t.cx[i];
      const dy = py - t.cy[i];
      const d2 = dx * dx + dy * dy;
      // Squared falloff: full strength under the pointer, nothing past RADIUS.
      const target = d2 >= RADIUS_SQ ? 0 : 1 - d2 / RADIUS_SQ;
      const next = t.cur[i] + (target - t.cur[i]) * EASE;
      const wasResting = t.cur[i] < REST && next < REST;
      t.cur[i] = next;
      if (wasResting) continue;
      live = true;
      const el = t.chars[i];
      if (next < REST) {
        // Land exactly on rest once, then stop writing this character.
        el.style.translate = "";
        if (t.mode === "chars") el.style.fontVariationSettings = "";
        el.style.removeProperty("--cx-t");
        t.cur[i] = 0;
        continue;
      }
      el.style.translate = `0 ${(lift * next).toFixed(2)}px`;
      if (t.mode === "chars") {
        el.style.fontVariationSettings = `"wght" ${Math.round(t.base[i] + WEIGHT_GAIN * next)}`;
      }
      // Colour is CSS's business; the engine only reports intensity.
      el.style.setProperty("--cx-t", next.toFixed(3));
    }
    t.live = live;
    active = active || live;
  }

  for (const t of magnetTargets) {
    const dx = px - t.cx;
    const dy = py - t.cy;
    const d = Math.hypot(dx, dy);
    let tx = 0;
    let ty = 0;
    if (d < t.reach && d > 0) {
      const pull = 1 - d / t.reach;
      tx = Math.max(-MAGNET_CAP_X, Math.min(MAGNET_CAP_X, dx * pull * 0.35));
      ty = Math.max(-MAGNET_CAP_Y, Math.min(MAGNET_CAP_Y, dy * pull * 0.35));
    }
    t.curX += (tx - t.curX) * EASE;
    t.curY += (ty - t.curY) * EASE;
    const resting = Math.abs(t.curX) < REST && Math.abs(t.curY) < REST;
    if (resting) {
      if (t.live) {
        // `translate` and not `transform`, so a hover:scale on the same
        // element composes with this instead of overwriting it.
        t.el.style.translate = "";
        t.curX = 0;
        t.curY = 0;
        t.live = false;
      }
      continue;
    }
    t.el.style.translate = `${t.curX.toFixed(2)}px ${t.curY.toFixed(2)}px`;
    t.live = true;
    active = true;
  }

  for (const t of glowTargets) {
    const inside =
      px >= t.left - RADIUS &&
      px <= t.left + t.w + RADIUS &&
      py >= t.top - RADIUS &&
      py <= t.top + t.h + RADIUS;
    if (inside) {
      t.el.style.setProperty("--cx-gx", `${(px - t.left).toFixed(1)}px`);
      t.el.style.setProperty("--cx-gy", `${(py - t.top).toFixed(1)}px`);
      t.el.style.setProperty("--cx-go", "1");
      t.on = true;
      active = true;
    } else if (t.on) {
      t.el.style.setProperty("--cx-go", "0");
      t.on = false;
    }
  }

  if (active) {
    frame = requestAnimationFrame(tick);
  } else {
    running = false;
  }
}

function wake() {
  if (running || reduced) return;
  running = true;
  frame = requestAnimationFrame(tick);
}

function onPointerMove(e: PointerEvent) {
  // A finger has no hover, and driving the field from touch leaves letters
  // stuck thick wherever the last tap landed.
  if (e.pointerType === "touch") return;
  px = e.clientX + window.scrollX;
  py = e.clientY + window.scrollY;
  wake();
}

function onPointerLeave() {
  px = -9999;
  py = -9999;
  wake();
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refresh, 120);
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  reduced = prefersReduced();
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", (e) => {
    reduced = e.matches;
    if (reduced) rest();
  });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("blur", onPointerLeave);
  window.addEventListener("resize", onResize, { passive: true });
}

/** Put everything back to its resting style and stop the loop. */
function rest() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  running = false;
  for (const t of charTargets) {
    t.chars.forEach((c, i) => {
      c.style.translate = "";
      c.style.fontVariationSettings = "";
      c.style.removeProperty("--cx-t");
      t.cur[i] = 0;
    });
    t.live = false;
  }
  for (const t of magnetTargets) {
    t.el.style.translate = "";
    t.curX = 0;
    t.curY = 0;
    t.live = false;
  }
  for (const t of glowTargets) {
    t.el.style.setProperty("--cx-go", "0");
    t.on = false;
  }
}

/**
 * Register a container whose `.cx-char` descendants should respond.
 * Returns an unregister function.
 */
export function registerChars(el: HTMLElement, mode: CursorTextMode): () => void {
  listen();
  const chars = Array.from(el.querySelectorAll<HTMLElement>(".cx-char"));
  const n = chars.length;
  const t: CharTarget = {
    el,
    mode,
    chars,
    cx: new Float64Array(n),
    cy: new Float64Array(n),
    base: new Float64Array(n),
    cur: new Float64Array(n),
    live: false,
  };
  if (mode === "chars") {
    for (let i = 0; i < n; i++) {
      const w = Number.parseInt(getComputedStyle(chars[i]).fontWeight, 10);
      t.base[i] = Number.isFinite(w) ? w : 400;
    }
  }
  measureChars(t);
  charTargets.add(t);
  return () => {
    charTargets.delete(t);
    t.chars.forEach((c) => {
      c.style.translate = "";
      c.style.fontVariationSettings = "";
      c.style.removeProperty("--cx-t");
    });
  };
}

/** Register an element that should drift toward the pointer. */
export function registerMagnet(el: HTMLElement): () => void {
  listen();
  const t: MagnetTarget = { el, cx: 0, cy: 0, reach: MAGNET_REACH, curX: 0, curY: 0, live: false };
  measureMagnet(t);
  magnetTargets.add(t);
  return () => {
    magnetTargets.delete(t);
    el.style.translate = "";
  };
}

/** Register a panel that carries a highlight tracking the pointer. */
export function registerGlow(el: HTMLElement): () => void {
  listen();
  const t: GlowTarget = { el, left: 0, top: 0, w: 0, h: 0, on: false };
  measureGlow(t);
  glowTargets.add(t);
  return () => {
    glowTargets.delete(t);
    el.style.removeProperty("--cx-gx");
    el.style.removeProperty("--cx-gy");
    el.style.removeProperty("--cx-go");
  };
}
