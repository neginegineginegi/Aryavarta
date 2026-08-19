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
  //
  // The safe-area padding below is inside this element, so `offsetHeight`
  // already counts it. That matters: the mobile nav panel opens at
  // `top: var(--masthead-h)`, and a measurement that ignored the notch would
  // put the panel's first link under the status bar.
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
    // Safe-area padding, because the document now runs edge to edge under
    // `viewport-fit=cover`. Top clears the notch and the status bar; left and
    // right clear the notch in landscape, where it sits over the wordmark on
    // one side and the account cluster on the other. The insets are 0 on every
    // device without a cutout, so this costs nothing anywhere else.
    <header
      ref={ref}
      className={`sticky top-0 z-40 border-b pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] transition-colors duration-200 ${
        lifted
          ? "border-rule bg-paper/85 backdrop-blur-md"
          : "border-transparent bg-transparent"
      }`}
    >
      {children}
    </header>
  );
}
