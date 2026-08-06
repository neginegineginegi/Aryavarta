"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Map" },
  { href: "/browse", label: "Browse" },
  { href: "/insights", label: "Insights" },
  { href: "/compare", label: "Compare" },
  { href: "/search", label: "Search" },
  { href: "/contribute", label: "Contribute" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Primary nav with an underline on the current section. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {NAV_LINKS.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 pb-0.5 pt-1 transition-colors ${
              active
                ? "border-accent font-medium text-ink"
                : "border-transparent text-ink-muted hover:border-rule-dark hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
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
