/* Section reveal — each band settles out of the page as it scrolls up.
 *
 * Deliberately DOM-driven rather than class-driven: it reads the children of
 * the element carrying [data-page] and writes inline styles, so it works on
 * sections it has never heard of and adds nothing to any existing component.
 *
 * Rules it keeps:
 *  - the first child (the hero) is never touched
 *  - a section already on screen at load is never hidden (no flash)
 *  - prefers-reduced-motion disables the whole thing
 *  - every inline style it sets is removed once the section has arrived
 */

const EASE = "cubic-bezier(.22,.61,.36,1)";
const SEEN = 0.9;       // fraction of the viewport that counts as "already visible"
const STAGGER = 80;     // ms between a section's own blocks
const MAX_INNER = 14;   // don't stagger a list longer than this

type Band = HTMLElement & { _svInner?: HTMLElement[] };

function hide(el: Band) {
  el.dataset.svArmed = "1";
  el.style.opacity = "0";
  el.style.transform = "translateY(34px) scale(.988)";
  el.style.filter = "blur(7px)";
  el.style.transition = `opacity .95s ${EASE}, transform 1.25s ${EASE}, filter 1.1s ${EASE}`;
  el.style.willChange = "opacity, transform, filter";

  let n: HTMLElement = el;
  for (let g = 0; g < 3 && n.children.length === 1; g++) n = n.children[0] as HTMLElement;
  const inner = Array.from(n.children) as HTMLElement[];
  el._svInner = inner.length > 1 && inner.length < MAX_INNER ? inner : [];
  el._svInner.forEach((k, i) => {
    k.dataset.svT = k.style.transform || "";
    k.style.opacity = "0";
    k.style.transform = `${k.dataset.svT} translateY(20px)`.trim();
    const d = 160 + i * STAGGER;
    k.style.transition = `opacity .8s ${EASE} ${d}ms, transform .95s ${EASE} ${d}ms`;
  });
}

function show(el: Band) {
  el.style.opacity = "1";
  el.style.transform = "none";
  el.style.filter = "none";
  for (const k of el._svInner || []) {
    k.style.opacity = "1";
    k.style.transform = k.dataset.svT || "";
  }
  window.setTimeout(() => {
    el.style.transition = "";
    el.style.willChange = "";
    el.style.filter = "";
    el.style.transform = "";
    delete el.dataset.svArmed;
    el.dataset.svShown = "1";
    for (const k of el._svInner || []) {
      k.style.transition = "";
      k.style.opacity = "";
      k.style.transform = k.dataset.svT || "";
      delete k.dataset.svT;
    }
  }, 2400);
}

/** Arms every not-yet-seen band under [data-page]. Returns a teardown fn. */
export function initSectionReveal(): () => void {
  if (typeof window === "undefined") return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const root = document.querySelector<HTMLElement>("[data-page]");
  if (!root) return () => {};

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        show(e.target as Band);
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -14% 0px", threshold: 0.03 }
  );

  const scan = () => {
    const vh = window.innerHeight;
    const kids = Array.from(root.children) as Band[];
    kids.forEach((el, i) => {
      if (i === 0 || el.dataset.sv) return;   // hero stays where it is
      el.dataset.sv = "1";
      if (el.getBoundingClientRect().top < vh * SEEN) return;  // on screen: leave alone
      hide(el);
      io.observe(el);
    });
  };

  scan();
  // client sections can mount a tick late; re-scan briefly, then stop.
  let n = 0;
  const t = window.setInterval(() => { scan(); if (++n > 6) window.clearInterval(t); }, 400);

  return () => { window.clearInterval(t); io.disconnect(); };
}
