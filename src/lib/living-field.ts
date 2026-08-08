/**
 * The living background: one number drives the whole page.
 *
 * `energy` starts at zero. Scrolling adds in proportion to distance moved,
 * pointer movement adds a little, a tap adds a lot. Every frame it decays
 * exponentially, roughly halving each quarter second. Wave height and drift
 * speed both scale off it, so the page swells when you act and settles when
 * you stop, and interrupting never looks wrong because nothing is a
 * fixed-duration animation with a start and an end to be caught mid-way.
 *
 * `phase` is pushed directly by scroll rather than by time, so a crest
 * physically travels through a band as the page moves instead of merely
 * wobbling faster.
 *
 * Built from the written spec in the "17 · Living background" handoff. Its
 * three source files were not in any uploaded bundle, and the reference
 * `Abhilekh Landing.dc.html` that IS in the bundles is the earlier static
 * version with no canvas in it at all, so every number here comes from the
 * handoff's prose. Meant to be replaced wholesale if the originals turn up.
 */

const DECAY = 2.6; // energy *= exp(-dt * DECAY)
const SCROLL_GAIN = 0.0016; // per pixel scrolled
const POINTER_GAIN = 0.00035; // per pixel of pointer travel
const TAP_GAIN = 0.9;
const PHASE_PER_PX = 0.005;
const RIPPLE_SPEED = 820; // px/s, the crest of a tap
const RIPPLE_LIFE = 1.5; // seconds
const ENERGY_CAP = 1.6;

type Variant = "wide" | "sharp" | "soft" | "reverse" | "faq";

type Spec = {
  /** Gradient stops, left to right. */
  stops: Array<[number, string]>;
  /** Band thickness in CSS pixels at the canvas's own scale. */
  thickness: number;
  /** Wave amplitude in CSS pixels before energy scaling. */
  amp: number;
  /** Render scale. Nothing is visible through a 42px blur at full res. */
  scale: number;
  /** Extra tilt, matching the prism it shadows. */
  tilt: number;
};

const SAFFRON_GREEN: Array<[number, string]> = [
  [0, "#ff9933"],
  [0.2, "#ffb066"],
  [0.42, "#fdf6ec"],
  [0.5, "#ffffff"],
  [0.58, "#f0f7ee"],
  [0.8, "#4d9e5f"],
  [1, "#138808"],
];
const GREEN_SAFFRON: Array<[number, string]> = [
  [0, "#138808"],
  [0.3, "#cfe8d2"],
  [0.5, "#ffffff"],
  [0.7, "#ffd9b3"],
  [1, "#ff9933"],
];

const SPECS: Record<Variant, Spec> = {
  wide: { stops: SAFFRON_GREEN, thickness: 200, amp: 46, scale: 0.4, tilt: -0.055 },
  sharp: { stops: SAFFRON_GREEN, thickness: 22, amp: 26, scale: 0.6, tilt: -0.061 },
  soft: { stops: SAFFRON_GREEN, thickness: 130, amp: 40, scale: 0.4, tilt: -0.052 },
  reverse: { stops: GREEN_SAFFRON, thickness: 112, amp: 36, scale: 0.4, tilt: -0.052 },
  faq: { stops: SAFFRON_GREEN, thickness: 88, amp: 30, scale: 0.4, tilt: -0.03 },
};

type Ribbon = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  spec: Spec;
  visible: boolean;
  w: number;
  h: number;
  seed: number;
  observer?: IntersectionObserver;
};

type Ripple = { x: number; born: number };

const ribbons = new Set<Ribbon>();
const lamps = new Set<HTMLElement>();
let ripples: Ripple[] = [];

let energy = 0;
let phase = 0;
let clock = 0; // seconds since first frame
let pointerX = -9999;
let pointerY = -9999;
let lastPointerX = 0;
let lastPointerY = 0;
let lastScrollY = 0;
let raf = 0;
let started = false;
let reduced = false;

/** Current excitement, 0 at rest. Read by the cursor field's scroll wave. */
export function fieldEnergy(): number {
  return energy;
}

/** Seconds since the field started running. */
export function fieldTime(): number {
  return clock;
}

function isReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * The centreline of a band at column x, in canvas pixels.
 *
 * Three sine waves at different wavelengths so the crest never repeats
 * visibly, a Gaussian bell around the pointer that bends and locally thickens
 * the band, and any live tap ripples riding outward.
 */
function centreline(x: number, w: number, r: Ribbon, a: number): { y: number; swell: number } {
  const t = clock;
  let y =
    Math.sin(x * 0.0042 + phase + r.seed) * a +
    Math.sin(x * 0.0113 - phase * 0.7 + r.seed * 2) * a * 0.45 +
    Math.sin(x * 0.0231 + t * 0.6 + r.seed * 3) * a * 0.2;

  // Pointer bell, in the canvas's own coordinate space.
  const rect = r.canvas.getBoundingClientRect();
  const px = (pointerX - rect.left) * (w / Math.max(1, rect.width));
  let swell = 0;
  if (pointerX > -9000) {
    const d = (x - px) / (w * 0.09);
    const bell = Math.exp(-d * d);
    y -= bell * a * 1.25;
    swell = bell;
  }

  for (const rp of ripples) {
    const age = clock - rp.born;
    if (age > RIPPLE_LIFE) continue;
    const crest = age * RIPPLE_SPEED * (w / Math.max(1, rect.width));
    const rx = (rp.x - rect.left) * (w / Math.max(1, rect.width));
    const dist = Math.abs(x - rx);
    const band = Math.abs(dist - crest);
    const width = w * 0.06;
    if (band < width) {
      const shape = Math.cos((band / width) * Math.PI * 0.5);
      const decay = 1 - age / RIPPLE_LIFE;
      y += shape * shape * decay * a * 1.6;
      swell = Math.max(swell, shape * decay);
    }
  }
  return { y, swell };
}

function draw(r: Ribbon) {
  const { ctx, spec, w, h } = r;
  ctx.clearRect(0, 0, w, h);

  // Amplitude answers energy, with a floor so a resting band still has shape.
  const a = spec.amp * spec.scale * (0.35 + Math.min(1, energy / ENERGY_CAP) * 0.65) * 0.8;
  const half = (spec.thickness * spec.scale) / 2;
  const mid = h / 2;
  const step = Math.max(2, Math.round(w / 160));

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  for (const [at, color] of spec.stops) grad.addColorStop(at, color);

  ctx.beginPath();
  const top: number[] = [];
  const bottom: number[] = [];
  for (let x = 0; x <= w; x += step) {
    const { y, swell } = centreline(x, w, r, a);
    const tilt = (x - w / 2) * spec.tilt;
    const t = half * (1 + swell * 0.55);
    top.push(mid + y + tilt - t);
    bottom.push(mid + y + tilt + t);
  }
  let i = 0;
  for (let x = 0; x <= w; x += step, i++) {
    if (i === 0) ctx.moveTo(x, top[i]);
    else ctx.lineTo(x, top[i]);
  }
  for (let x = Math.floor(w / step) * step, j = top.length - 1; j >= 0; x -= step, j--) {
    ctx.lineTo(x, bottom[j]);
  }
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
}

function resize(r: Ribbon) {
  const rect = r.canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  r.w = Math.max(1, Math.round(rect.width * r.spec.scale));
  r.h = Math.max(1, Math.round(rect.height * r.spec.scale));
  r.canvas.width = r.w;
  r.canvas.height = r.h;
}

function frame(now: number) {
  raf = 0;
  const dt = Math.min(0.05, clock === 0 ? 0.016 : now / 1000 - clock);
  clock = now / 1000;

  energy *= Math.exp(-dt * DECAY);
  if (energy < 0.0005) energy = 0;
  ripples = ripples.filter((rp) => clock - rp.born <= RIPPLE_LIFE);

  for (const r of ribbons) if (r.visible) draw(r);
  updateLamps();

  // Keep running while anything is still moving: energy decaying, a ripple
  // travelling, or the pointer resting over a band and holding its bell.
  const busy = energy > 0.002 || ripples.length > 0 || pointerX > -9000;
  if (busy) raf = requestAnimationFrame(frame);
  else started = false;
}

function wake() {
  if (raf || reduced) return;
  started = true;
  raf = requestAnimationFrame(frame);
}

function updateLamps() {
  for (const el of lamps) {
    const rect = el.getBoundingClientRect();
    const inside =
      pointerX >= rect.left - 40 &&
      pointerX <= rect.right + 40 &&
      pointerY >= rect.top - 20 &&
      pointerY <= rect.bottom + 20;
    if (inside) {
      el.style.setProperty("--lamp-x", `${pointerX - rect.left}px`);
      el.style.setProperty("--lamp-o", "1");
    } else {
      el.style.setProperty("--lamp-o", "0");
    }
  }
}

function onScroll() {
  const y = window.scrollY;
  const dy = y - lastScrollY;
  lastScrollY = y;
  energy = Math.min(ENERGY_CAP, energy + Math.abs(dy) * SCROLL_GAIN);
  phase += dy * PHASE_PER_PX;
  wake();
}

function onPointerMove(e: PointerEvent) {
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  pointerX = e.clientX;
  pointerY = e.clientY;
  energy = Math.min(ENERGY_CAP, energy + Math.hypot(dx, dy) * POINTER_GAIN);
  wake();
}

function onPointerOut() {
  pointerX = -9999;
  pointerY = -9999;
  wake();
}

/** A tap sends a real expanding ring outward from where it landed. */
function onTap(e: PointerEvent) {
  ripples.push({ x: e.clientX, born: clock });
  if (ripples.length > 6) ripples.shift();
  energy = Math.min(ENERGY_CAP, energy + TAP_GAIN);
  wake();
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const r of ribbons) {
      resize(r);
      draw(r);
    }
  }, 140);
}

function listen() {
  if (started || reduced) return;
  lastScrollY = window.scrollY;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerout", onPointerOut, { passive: true });
  window.addEventListener("pointerdown", onTap, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  wake();
}

/** Register a ribbon canvas. Returns an unregister function. */
export function registerRibbon(canvas: HTMLCanvasElement, variant: Variant): () => void {
  reduced = isReduced();
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const r: Ribbon = {
    canvas,
    ctx,
    spec: SPECS[variant],
    visible: true,
    w: 1,
    h: 1,
    // A stable per-band offset so the five bands never crest in unison.
    seed: ribbons.size * 1.7,
  };
  resize(r);
  ribbons.add(r);

  if (reduced) {
    // One still frame, and no listeners bound at all.
    draw(r);
    return () => {
      ribbons.delete(r);
    };
  }

  // A band scrolled out of view costs nothing.
  if (typeof IntersectionObserver !== "undefined") {
    r.observer = new IntersectionObserver(
      (entries) => {
        r.visible = entries[0]?.isIntersecting ?? true;
        if (r.visible) wake();
      },
      { rootMargin: "120px" },
    );
    r.observer.observe(canvas);
  }
  listen();
  draw(r);
  return () => {
    r.observer?.disconnect();
    ribbons.delete(r);
  };
}

/** Register a row that should light under the pointer. */
export function registerLamp(el: HTMLElement): () => void {
  if (isReduced()) return () => {};
  lamps.add(el);
  listen();
  return () => {
    lamps.delete(el);
    el.style.removeProperty("--lamp-x");
    el.style.removeProperty("--lamp-o");
  };
}
