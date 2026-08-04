import Link from "next/link";

import { AuthNav } from "@/components/layout/AuthNav";

const NAV_LINKS = [
  { href: "/", label: "Map" },
  { href: "/browse", label: "Browse" },
  { href: "/compare", label: "Compare" },
  { href: "/search", label: "Search" },
  { href: "/contribute", label: "Contribute" },
];

export function Header() {
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-6 px-5 py-4">
        <span className="flex items-baseline gap-4">
          <Link href="/" className="group flex items-baseline gap-3">
            <span className="font-display text-2xl font-semibold tracking-tight text-ink">
              Abhilekh
            </span>
            <span className="hidden text-[0.8rem] text-ink-muted lg:inline">
              India Politics Archive
            </span>
          </Link>
          {/* Union / State mode switch (vision #2) */}
          <span className="inline-flex overflow-hidden rounded-sm border border-rule-dark text-[0.78rem]">
            <Link href="/" className="px-2.5 py-0.5 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink">
              States
            </Link>
            <Link
              href="/union"
              className="border-l border-rule-dark px-2.5 py-0.5 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
            >
              Union
            </Link>
          </span>
        </span>
        <nav className="flex items-baseline gap-5 text-[0.85rem]">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-ink-muted transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
