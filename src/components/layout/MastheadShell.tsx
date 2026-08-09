"use client";

import { useEffect, useRef, useState } from "react";

/**
 * At rest the masthead has no surface of its own: no background, no blur, no
 * rule. Whatever the page puts at the top shows straight through, so the
 * wordmark and nav sit ON the hero rather than in a band above it, which is
 * the unbroken top the design calls for.
 *
 * All of it arrives together the moment content starts passing underneath,
 * which is when a header genuinely needs to separate itself from what it
 * overlaps.
 */
export function MastheadShell({ children }: { children: React.ReactNode }) {
  const [lifted, setLifted] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The masthead publishes its own height so a full-bleed hero can reach up
  // through the space it occupies and be one unbroken surface behind it.
  // Measured rather than assumed: the nav wraps below lg, which makes the
  // masthead taller, and a hard-coded number would leave a seam there.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = () =>
      document.documentElement.style.setProperty("--masthead-h", `${el.offsetHeight}px`);
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header
      ref={ref}
      className={`sticky top-0 z-40 border-b transition-colors duration-200 ${
        lifted
          ? "border-rule bg-paper/85 backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      {children}
    </header>
  );
}
