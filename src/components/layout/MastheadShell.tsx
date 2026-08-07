"use client";

import { useEffect, useState } from "react";

/**
 * The masthead has no divider while the page is at rest: at the top of the
 * page there is nothing to separate it from, and a rule drawn there is pure
 * decoration. A hairline fades in only once content begins to pass beneath
 * it, which is the moment the separation actually means something.
 */
export function MastheadShell({ children }: { children: React.ReactNode }) {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-paper/85 backdrop-blur-md transition-colors duration-200 ${
        lifted ? "border-rule" : "border-transparent"
      }`}
    >
      {children}
    </header>
  );
}
