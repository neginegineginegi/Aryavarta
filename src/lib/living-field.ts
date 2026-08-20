"use client";

/**
 * Living field — the shared excitement of the page.
 *
 * One rAF loop owns three things:
 *   energy   how stirred up the page is. Every input adds; it decays exponentially.
 *   phase    where the wave crest sits. Scrolling pushes it directly.
 *   ripples  expanding rings from taps and clicks.
 *
 * Ribbons (the tricolor bands) read all three. Nothing here touches type: the
 * scroll wave that used to run under body text is gone, because a page you
 * read is a page whose words hold still.
 *
 * THE RESTING WAVE IS DELIBERATE. The idle amplitude floor (18, in draw) is set
 * so the bands drift visibly with no input at all; it is not a stuck value left
 * over from an interaction. It is calibrated against each variant's BLUR, not
 * in absolute pixels: .ribbon-wide is blur(42px), so the 11px travel the old
 * floor of 7 produced was invisible by construction. See the note on A below.
 */

type Ribbon = {
  el: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  th: number;      // ribbon thickness in CSS px
  amp: number;     // per-band amplitude multiplier
  ss: number;      // backing-store scale — these are blurred, so half-res is free
  tilt: number;    // px of lean across the full width
  flip: boolean;   // green→saffron instead of saffron→green
  fade: boolean;   // dissolve at both ends
  seed: number;
  w: number;
  h: number;
  vis: boolean;
};

let ribbons: Ribbon[] = [];
let energy = 0;
let phase = 0;
let time = 0;
let last = 0;
let raf: number | null = null;
/** Frame counter, for the half-rate resting draw in tick(). */
let frame = 0;
let scroll = 0;
let started = false;
let reduced = false;
let lamp: HTMLElement | null = null;
const pointer = { x: 0, y: 0, has: false };
const ripples: { x: number; age: number }[] = [];
let io: IntersectionObserver | null = null;

/** How stirred up the page is, 0..~2.4. Ribbons ride this: it takes scroll,
 *  pointer travel and taps alike, and decays slowly. */
export function fieldEnergy() {
  return energy;
}
export function fieldTime() {
  return time;
}

export function registerRibbon(
  el: HTMLCanvasElement,
  opts: { th: number; amp?: number; ss?: number; tilt?: number; flip?: boolean; fade?: boolean },
): () => void {
  start();
  const ctx = el.getContext("2d");
  if (!ctx) return () => {};
  const r: Ribbon = {
    el, ctx,
    th: opts.th,
    amp: opts.amp ?? 1,
    ss: opts.ss ?? 0.4,
    tilt: opts.tilt ?? 0,
    flip: !!opts.flip,
    fade: !!opts.fade,
    seed: ribbons.length * 1.7,
    w: 0, h: 0, vis: true,
  };
  ribbons.push(r);
  size(r);
  // once we are painting, drop the CSS gradient the no-JS fallback used
  el.style.background = "none";
  el.style.animation = "none";
  io?.observe(el);
  kick();
  return () => {
    io?.unobserve(el);
    ribbons = ribbons.filter((o) => o !== r);
  };
}

function size(r: Ribbon, rect?: DOMRect) {
  const b = rect || r.el.getBoundingClientRect();
  r.w = Math.max(1, Math.round(b.width * r.ss));
  r.h = Math.max(1, Math.round(b.height * r.ss));
  r.el.width = r.w;
  r.el.height = r.h;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroll = window.scrollY;
  io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        const r = ribbons.find((o) => o.el === e.target);
        if (r) r.vis = e.isIntersecting;
      }
      kick();
    },
    { rootMargin: "120px 0px" },
  );
  if (reduced) return;

  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    const dy = y - scroll;
    scroll = y;
    energy = Math.min(2.4, energy + Math.abs(dy) * 0.02);
    phase += dy * 0.005;          // the crest travels with the page
    kick();
  }, { passive: true });

  window.addEventListener("pointermove", (e) => {
    const v = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.has = true;
    energy = Math.min(2.4, energy + Math.min(0.22, v * 0.004));
    lampMove(e);
    kick();
  }, { passive: true });

  window.addEventListener("pointerdown", (e) => {
    ripples.push({ x: e.clientX, age: 0 });
    if (ripples.length > 6) ripples.shift();
    energy = Math.min(2.6, energy + 0.9);
    kick();
  }, { passive: true });

  window.addEventListener("pointerleave", () => { pointer.has = false; kick(); });
  window.addEventListener("resize", () => { ribbons.forEach((r) => size(r)); kick(); });
}

/** A highlight that sits under the cursor inside [data-lamp] rows. */
function lampMove(e: PointerEvent) {
  const t = (e.target as Element | null)?.closest?.("[data-lamp]") as HTMLElement | null;
  if (t !== lamp) {
    lamp?.style.setProperty("--lamp", "0");
    lamp = t;
    t?.style.setProperty("--lamp", "1");
  }
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty("--lamp-x", `${Math.round(e.clientX - r.left)}px`);
  t.style.setProperty("--lamp-y", `${Math.round(e.clientY - r.top)}px`);
}

function kick() {
  if (raf !== null) return;
  if (reduced) { ribbons.forEach((r) => draw(r, r.el.getBoundingClientRect())); return; }
  raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = null;
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  // 0.75 at rest: a 7.6s swell rather than the 10.4s one that read as still.
  // Raised only this far on purpose. Velocity is amplitude times speed, and
  // the amplitude floor below already went up 2.6x; pushing speed harder turns
  // the swell into a shimmer, which is the one thing a background must not do
  // behind text.
  time += dt * (0.75 + energy * 1.5);   // excitement speeds the drift up
  // 1.2 gives a 0.58s half-life. At the old 2.6 it was 0.27s, so excitement
  // snapped back before the eye had followed it; now it subsides.
  energy *= Math.exp(-dt * 1.2);        // and it always falls back to calm
  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i].age += dt;
    if (ripples[i].age > 1.7) ripples.splice(i, 1);
  }

  // The resting swell is drawn at half rate.
  //
  // The expensive part of a ribbon is not this file: it is the compositor
  // re-blurring a 42px-radius layer every time the canvas changes. Measured on
  // the homepage with five bands and no input, script was 0.3ms a frame while
  // the frame as a whole cost 6.9% of a core unthrottled and 67% at 6x. A 7.6
  // second swell does not need 60fps to look continuous, and halving it there
  // leaves the page cheaper than it was before the floor went up.
  //
  // Full rate the moment anything is happening, so a pointer bulge or a ripple
  // never looks like it is lagging the cursor. `time` still advances every
  // frame either way, so the wave keeps moving at the same speed; only the
  // number of times it is painted changes.
  frame++;
  const lively = energy > 0.15 || ripples.length > 0;
  const paint = lively || frame % 2 === 0;

  let awake = false;
  for (const r of ribbons) {
    if (!r.vis) continue;
    const b = r.el.getBoundingClientRect();
    if (b.width < 1) continue;
    awake = true;
    if (!paint) continue;
    if (Math.round(b.width * r.ss) !== r.w || Math.round(b.height * r.ss) !== r.h) size(r, b);
    draw(r, b);
  }

  // the fixed page wash leans a little with the cursor and the scroll
  const nx = pointer.has ? pointer.x / Math.max(1, window.innerWidth) - 0.5 : 0;
  document.documentElement.style.backgroundPosition =
    `${(50 + nx * 4).toFixed(2)}% ${(50 + Math.sin(scroll * 0.0012) * 4).toFixed(2)}%`;

  // Keep going while the page is still excited even with no ribbon on screen.
  // `energy` and `time` only advance in here, and the cursor field's letter
  // wave reads both: parking the loop with energy still high freezes the wave
  // mid-crest and leaves every character in the top section bent for good.
  if (awake || energy > 0.002) raf = requestAnimationFrame(tick);
}

const TRI: [number, string][] = [
  [0, "#ff9933"], [0.2, "#ffb066"], [0.42, "#fdf6ec"], [0.5, "#ffffff"],
  [0.58, "#f0f7ee"], [0.8, "#4d9e5f"], [1, "#138808"],
];
const TRI_REVERSE: [number, string][] = [
  [0, "#138808"], [0.3, "#cfe8d2"], [0.5, "#ffffff"], [0.7, "#ffd9b3"], [1, "#ff9933"],
];

function draw(r: Ribbon, rect: DOMRect) {
  const { ctx, w: W, h: H, ss: S } = r;
  ctx.clearRect(0, 0, W, H);
  const y0 = H / 2;
  const base = r.th * S;
  const tilt = r.tilt * S;
  // 18 is the RESTING floor, and it is the number that makes the bands move on
  // their own. It is set against the blur, not in the abstract: .ribbon-wide is
  // blur(42px), and the three-sine sum travels about 0.79 * A either side of
  // the centreline, so a floor of 7 gave 11px of travel inside a 42px Gaussian.
  // Invisible by construction, which is why the bands read as static until the
  // pointer moved. 18 gives 28px, about 0.68 of that blur radius: a slow swell
  // you can see, still far short of anything that competes with reading.
  //
  // The gain stays at 22 rather than rising with the floor. The visible range
  // is capped by the canvas edge, not by this number: on .ribbon-wide the wave
  // reaches the edge of its box around A = 66, so past a gain of roughly 20 the
  // extra excited amplitude is spent against a clip nobody sees.
  const A = (18 + energy * 22) * r.amp * S;
  const px = (pointer.x - rect.left) * S;
  const py = (pointer.y - rect.top) * S;
  const step = Math.max(3, Math.round(6 * S));
  const xs: number[] = [], ys: number[] = [], ths: number[] = [];

  for (let x = 0; x <= W + step; x += step) {
    const u = x / W;
    // three sines at different wavelengths: one long swell, two ripples
    let y = y0 + tilt * (u - 0.5)
      + A * Math.sin(u * 9.4 + time * 1.1 + r.seed + phase)
      + A * 0.45 * Math.sin(u * 19.7 - time * 0.75 + r.seed * 1.7)
      + A * 0.22 * Math.sin(u * 31 - time * 1.6);
    let th = base;
    if (pointer.has) {
      const d = (x - px) / (150 * S);
      const g = Math.exp(-d * d * 0.5);      // bell curve around the cursor
      y += (py - y0) * 0.5 * g;
      th = base * (1 + 0.6 * g);
    }
    for (const rp of ripples) {
      const dist = Math.abs(x - (rp.x - rect.left) * S);
      const front = rp.age * 820 * S;        // the crest travels outward
      const env = Math.exp(-((dist - front) ** 2) / (2 * (130 * S) ** 2)) * Math.exp(-rp.age * 1.8);
      y += Math.sin((dist - front) * 0.022) * env * 44 * S;
      th += env * base * 0.35;
    }
    xs.push(x); ys.push(y); ths.push(th);
  }

  ctx.beginPath();
  ctx.moveTo(xs[0], ys[0] - ths[0] / 2);
  for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i] - ths[i] / 2);
  for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], ys[i] + ths[i] / 2);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, 0, W, 0);
  for (const [p, col] of r.flip ? TRI_REVERSE : TRI) g.addColorStop(p, col);
  ctx.fillStyle = g;
  ctx.fill();

  if (r.fade) {
    const m = ctx.createLinearGradient(0, 0, W, 0);
    m.addColorStop(0, "rgba(0,0,0,1)");
    m.addColorStop(0.18, "rgba(0,0,0,0)");
    m.addColorStop(0.82, "rgba(0,0,0,0)");
    m.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
}
