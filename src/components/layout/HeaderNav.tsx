"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { refresh } from "@/lib/cursor-field";
import { useGlow, useMagnetic } from "@/lib/use-cursor";

/** Menu timing, from the handoff's motion table. */
const OPEN_DELAY = 55;
const CLOSE_DELAY = 170;
const STAGGER = 42;

type Dest = { href: string; label: string; blurb?: string };
type NavItem = { href: string; label: string; panel?: Dest[] };

/**
 * Every href below was checked against the route folders under src/app.
 * Nothing here is aspirational: a masthead that links to a 404 is worse than
 * a masthead with fewer links. Anchors point at ids that exist in the page
 * they name (`#indicators` in browse/page.tsx, `#faq` in page.tsx).
 */
const NAV: NavItem[] = [
  {
    href: "/",
    label: "Map",
    panel: [
      { href: "/", label: "States and territories", blurb: "Who governed, year by year" },
      { href: "/union", label: "Union", blurb: "The national record" },
    ],
  },
  {
    href: "/browse",
    label: "Browse",
    panel: [
      { href: "/browse", label: "Everything", blurb: "States, parties, elections" },
      { href: "/browse#indicators", label: "Development indicators", blurb: "Sourced, never scored" },
      { href: "/archive", label: "Media archive", blurb: "Manifestos and documents" },
    ],
  },
  {
    href: "/insights",
    label: "Insights",
    panel: [
      { href: "/insights", label: "Patterns in the record", blurb: "Computed, not written" },
      { href: "/compare", label: "Compare", blurb: "Two elections side by side" },
    ],
  },
  {
    href: "/network",
    label: "Network",
    panel: [
      { href: "/network", label: "Explore the network", blurb: "Follow a relationship outward" },
      {
        href: "/network/connect",
        label: "What connects two entities",
        blurb: "Paths and shared connections",
      },
    ],
  },
  {
    href: "/search",
    label: "Search",
    panel: [
      { href: "/search", label: "Search the archive", blurb: "Records and full text" },
      { href: "/methodology", label: "Methodology", blurb: "How a record is sourced" },
      { href: "/about", label: "About", blurb: "What this is for" },
      { href: "/#faq", label: "Questions", blurb: "Common ones, answered" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const base = href.split("#")[0];
  return pathname === base || pathname.startsWith(`${base}/`);
}

function NavEntry({
  item,
  align,
  open,
  onOpen,
  onClose,
  onCloseNow,
}: {
  item: NavItem;
  align: "left" | "right";
  open: boolean;
  onOpen: () => void;
  /** Delayed: forgives a pointer crossing the gap to the panel. */
  onClose: () => void;
  /** Immediate: a keyboard dismiss must not wait out a pointer delay. */
  onCloseNow: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const panelId = useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const glowRef = useGlow<HTMLDivElement>(Boolean(item.panel));

  // The engine caches geometry in document coordinates, so opening a panel
  // moves nothing it knows about until it is told.
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        onCloseNow();
        triggerRef.current?.focus();
      }
    },
    [open, onCloseNow],
  );

  // Focus leaving the whole group closes it; focus moving between the trigger
  // and its items does not.
  const onBlurCapture = useCallback(
    (e: React.FocusEvent) => {
      if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) onCloseNow();
    },
    [onCloseNow],
  );

  const link = (
    <Link
      ref={triggerRef}
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-expanded={item.panel ? open : undefined}
      aria-controls={item.panel ? panelId : undefined}
      onFocus={item.panel ? onOpen : undefined}
      className={`border-b-2 pb-0.5 font-display text-[16.5px] font-medium transition-colors ${
        active ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {item.label}
    </Link>
  );

  if (!item.panel) return link;

  return (
    <div
      ref={wrapRef}
      className="nav-entry relative"
      data-open={open ? "true" : "false"}
      onPointerEnter={onOpen}
      onPointerLeave={onClose}
      onKeyDown={onKeyDown}
      onBlurCapture={onBlurCapture}
    >
      {link}
      <div
        ref={glowRef}
        id={panelId}
        data-open={open ? "true" : "false"}
        data-align={align}
        className="nav-panel cx-glow"
      >
        <ul>
          {item.panel.map((d, i) => (
            <li
              key={d.href}
              className="nav-panel-item"
              style={{ animationDelay: `${i * STAGGER}ms` }}
            >
              <Link
                href={d.href}
                onClick={onCloseNow}
                className="block rounded-[10px] px-3 py-2 transition-colors hover:bg-paper-sunken"
              >
                <span className="block font-display text-[15px] text-ink">{d.label}</span>
                {d.blurb ? (
                  <span className="mt-0.5 block text-[12.5px] text-ink-faint">{d.blurb}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        <hr className="tricolor-rule mx-3 mt-1" />
      </div>
    </div>
  );
}

/**
 * Primary nav. Newsreader at 16.5px so navigation speaks in the same
 * editorial voice as the page titles, with a 2px rule under the current
 * section, plus a panel of real destinations on the four entries that have
 * somewhere to send you.
 */
export function NavLinks() {
  const pathname = usePathname();
  // The open panel is stamped with the route it was opened on, so a route
  // change closes it by DERIVATION rather than by an effect that sets state
  // during commit and cascades a second render.
  const [open, setOpen] = useState<{ index: number; path: string } | null>(null);
  const openIndex = open && open.path === pathname ? open.index : null;

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const schedule = useCallback(
    (next: number | null, delay: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(
        () => setOpen(next === null ? null : { index: next, path: pathname }),
        delay,
      );
    },
    [pathname],
  );

  const closeNow = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(null);
  }, []);

  // The two rightmost panels align right so an open one cannot reach past the
  // viewport, and a closed one cannot widen the scroll extent.
  const panelIndexes = NAV.map((n, i) => (n.panel ? i : -1)).filter((i) => i >= 0);
  const rightAligned = new Set(panelIndexes.slice(-2));

  return (
    <>
      {NAV.map((item, i) => (
        <NavEntry
          key={item.label}
          item={item}
          align={rightAligned.has(i) ? "right" : "left"}
          open={openIndex === i}
          onOpen={() => schedule(i, OPEN_DELAY)}
          onClose={() => schedule(null, CLOSE_DELAY)}
          onCloseNow={closeNow}
        />
      ))}
    </>
  );
}

/** The Contribute pill, which drifts toward the pointer as it approaches. */
export function ContributeButton() {
  const ref = useMagnetic<HTMLAnchorElement>();
  return (
    <Link
      ref={ref}
      href="/contribute"
      className="cx-magnet btn btn-primary px-4 py-2 text-[13px]"
    >
      Contribute
    </Link>
  );
}

/** States / Union segmented switch; Union lights up anywhere under /union. */
export function ModeSwitch() {
  const pathname = usePathname();
  const unionActive = pathname === "/union" || pathname.startsWith("/union/");
  const base = "px-3 py-1 transition-colors";
  const on = "bg-accent-wash font-medium text-accent-dark";
  const off = "text-ink-muted hover:bg-paper-sunken hover:text-ink";
  return (
    <span className="inline-flex overflow-hidden rounded-full border border-rule-dark font-mono text-[0.7rem]">
      <Link href="/" className={`${base} ${unionActive ? off : on}`}>
        States
      </Link>
      <Link
        href="/union"
        className={`${base} border-l border-rule-dark ${unionActive ? on : off}`}
      >
        Union
      </Link>
    </span>
  );
}
