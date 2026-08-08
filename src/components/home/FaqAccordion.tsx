"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { registerLamp } from "@/lib/living-field";

export type Faq = { q: string; a: string };

/**
 * Single-open accordion, per the design handoff: clicking the open item
 * closes it, and the first item is open on load. Every answer stays in the
 * DOM so the copy is present for search engines and for readers without JS.
 */
export function FaqAccordion({ items }: { items: Faq[] }) {
  const [open, setOpen] = useState(0);

  // The lamp follows the pointer along the row, so the flat hover fill is
  // gone: two highlights fighting over the same row reads as a bug.
  const rows = useRef(new Map<HTMLElement, () => void>());
  const lampRef = useCallback((el: HTMLElement | null) => {
    if (el && !rows.current.has(el)) rows.current.set(el, registerLamp(el));
  }, []);
  useEffect(() => {
    const registry = rows.current;
    return () => {
      registry.forEach((stop) => stop());
      registry.clear();
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-2.5">
      {items.map((f, i) => {
        const isOpen = i === open;
        return (
          <div key={f.q} className="overflow-hidden rounded-[14px] bg-paper-sunken">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              data-lamp
              ref={(el) => lampRef(el)}
              className="lamp-row flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-[14.5px] font-medium text-ink">{f.q}</span>
              <span aria-hidden className="shrink-0 text-[12px] text-ink-meta">
                {isOpen ? "▲" : "▼"}
              </span>
            </button>
            <div hidden={!isOpen} className="px-5 pb-[18px] text-[14px] leading-[1.65] text-ink-muted">
              {f.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
