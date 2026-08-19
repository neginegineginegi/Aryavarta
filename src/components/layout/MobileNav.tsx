"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { AuthNav } from "@/components/layout/AuthNav";
import { NAV } from "@/components/layout/HeaderNav";

/**
 * The masthead below `lg`.
 *
 * The desktop nav is a hover-and-dwell affair: five triggers that open panels
 * after a delay. None of that exists on a touch screen, and letting it wrap
 * instead produced what shipped until now, which was two rows of links with
 * the account buttons floating under them and the whole masthead tall enough
 * to cover the first control on the page it was overlapping.
 *
 * So below `lg` the nav is one button and one panel. Every destination the
 * dropdowns hold is listed flat, because a menu that needs a second tap to
 * reveal its real contents is the same hover problem wearing a different hat.
 *
 * It closes on route change by DERIVATION rather than an effect: the open
 * state is stamped with the path it opened on, the same trick NavLinks uses,
 * so navigating away cannot leave a panel behind.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const isOpen = open === pathname;
  const panelId = useId();

  // Escape closes it, because a full-screen panel with no keyboard exit is a
  // trap for anyone not using touch.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // A panel taller than the viewport must not scroll the page behind it.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(isOpen ? null : pathname)}
        className="flex items-center gap-2 rounded-sm border border-rule-dark px-3 py-2 text-[13px] text-ink transition-colors hover:border-ink"
      >
        <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {isOpen ? (
            <>
              <path d="M2 2l10 8" />
              <path d="M12 2L2 10" />
            </>
          ) : (
            <>
              <path d="M1 2h12" />
              <path d="M1 6h12" />
              <path d="M1 10h12" />
            </>
          )}
        </svg>
        {isOpen ? "Close" : "Menu"}
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="fixed inset-x-0 top-[var(--masthead-h,64px)] bottom-0 z-50 overflow-y-auto border-t border-rule bg-paper px-6 py-6"
        >
          <nav className="mx-auto max-w-2xl">
            {NAV.map((item) => (
              <div key={item.label} className="border-b border-rule-light py-4 first:pt-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(null)}
                  className="block font-display text-[19px] text-ink"
                >
                  {item.label}
                </Link>
                {item.panel && (
                  <ul className="mt-2 space-y-2">
                    {item.panel.map((d) => (
                      <li key={d.href}>
                        <Link
                          href={d.href}
                          onClick={() => setOpen(null)}
                          className="block text-[15px] text-ink-muted"
                        >
                          {d.label}
                          {d.blurb && (
                            <span className="block text-[12.5px] text-ink-faint">{d.blurb}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {/* The account cluster lives in the masthead on desktop, where
                there is room for it. Hiding it below lg without putting it
                here would have left a phone with no way to sign in. */}
            <div className="pt-5">
              <AuthNav />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
