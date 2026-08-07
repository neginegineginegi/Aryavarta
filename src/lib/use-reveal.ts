"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll reveal for a section card.
 *
 * The handoff's version hunted the DOM for inline border-radius values on a
 * timer, which suits a static prototype and nothing else. This does the same
 * job as a hook: the element only becomes hidden once JavaScript has run and
 * confirmed it is below the fold, so the page is fully readable with scripts
 * blocked and nothing above the fold ever flashes in.
 *
 * Reduced motion is checked before the class is applied at all, so the
 * element is never displaced in the first place rather than being animated
 * and then corrected.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    // Already on screen: leave it alone. Revealing what the reader is
    // already looking at is the one case where the animation is pure noise.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.96) return;

    el.classList.add("reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("reveal-in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return ref;
}
