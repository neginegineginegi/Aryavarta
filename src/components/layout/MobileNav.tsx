"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { AuthNav } from "@/components/layout/AuthNav";
import { NAV } from "@/components/layout/HeaderNav";

/**
 * The masthead below `lg`.
 *
 * The desktop nav is a hover-and-dwell affair: five triggers that open panels
 * after a delay. None of that exists on a touch screen, and letting it wrap
 * instead produced two rows of links with the account buttons floating under
 * them, in a masthead tall enough to cover the first control of the page it
 * overlapped.
 *
 * So below `lg` the nav is one button and one panel. Every destination the
 * dropdowns hold is listed flat, because a menu that needs a second tap to
 * reveal its real contents is the same hover problem wearing a different hat.
 *
 * Converting hover panels to a disclosure is where focus management usually
 * gets dropped, so it is handled explicitly here rather than left to the
 * browser: focus enters the panel on open and returns to the trigger on close,
 * Tab cycles inside it, Escape leaves, and the rest of the page is `inert`
 * while it is up. A panel you can Tab out of, behind which the page is still
 * clickable, is a panel a screen reader user has no way to leave.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Set when closing, so focus returns to the trigger only after a real
   *  open. Closing on a route change must not steal focus from the new page. */
  const restoreFocus = useRef(false);

  const close = useCallback(() => {
    restoreFocus.current = true;
    setOpen(null);
  }, []);

  // Focus in on open, back to the trigger on close.
  useEffect(() => {
    if (isOpen) {
      // The first link, not the panel itself: a screen reader announcing an
      // empty container tells the reader nothing about where they landed.
      panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
      return;
    }
    if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  // Escape leaves, and Tab cycles within the panel rather than walking out of
  // it into a page the reader cannot see.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      ].filter((el) => el.offsetParent !== null);
      // The trigger is part of the cycle: it is the Close button while open,
      // so Shift+Tab from the first link should reach it rather than escape.
      const ring = triggerRef.current ? [triggerRef.current, ...focusable] : focusable;
      if (ring.length === 0) return;
      const first = ring[0];
      const last = ring[ring.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // The page behind is inert and unscrollable. `inert` covers both pointer and
  // assistive technology, which aria-hidden alone does not: aria-hidden leaves
  // the content clickable and tabbable.
  useEffect(() => {
    if (!isOpen) return;
    const behind = [...document.querySelectorAll<HTMLElement>("main, footer")];
    for (const el of behind) el.inert = true;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const el of behind) el.inert = false;
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => (isOpen ? close() : setOpen(pathname))}
        // min-h/min-w 44px: the WCAG target size, which the old 83x39 button
        // missed on the axis that matters most for a thumb.
        className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-sm border border-rule-dark px-3 text-[13px] text-ink transition-colors hover:border-ink"
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
          ref={panelRef}
          id={panelId}
          // A dialog rather than a bare div: it names itself to a screen
          // reader, and modal matches what inert has made true of the page.
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          // Safe-area on three edges under `viewport-fit=cover`: bottom for the
          // home indicator, which otherwise sits on top of the last link, and
          // left/right for the landscape notch. `max()` keeps the design's 24px
          // gutter on phones with no cutout, where the insets are 0.
          className="fixed inset-x-0 top-[var(--masthead-h,64px)] bottom-0 z-50 overflow-y-auto border-t border-rule bg-paper pt-6 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <nav className="mx-auto max-w-2xl">
            {NAV.map((item) => (
              <div key={item.label} className="border-b border-rule-light py-2 first:pt-0">
                <Link
                  href={item.href}
                  onClick={close}
                  className="flex min-h-[44px] items-center font-display text-[19px] text-ink"
                >
                  {item.label}
                </Link>
                {item.panel && (
                  <ul>
                    {item.panel.map((d) => (
                      <li key={d.href}>
                        <Link
                          href={d.href}
                          onClick={close}
                          className="flex min-h-[44px] flex-col justify-center py-1 text-[15px] text-ink-muted"
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
            <div className="mobile-auth pt-5">
              <AuthNav />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
