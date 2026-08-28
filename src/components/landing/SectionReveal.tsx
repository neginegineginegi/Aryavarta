"use client";

import { useEffect } from "react";
import { initSectionReveal } from "./section-reveal";

/**
 * Mount ONCE, anywhere inside the page. Renders nothing.
 * Requires the page's top-level section wrapper to carry data-page.
 */
export function SectionReveal() {
  useEffect(() => initSectionReveal(), []);
  return null;
}
