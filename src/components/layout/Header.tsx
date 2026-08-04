import Link from "next/link";

import { AuthNav } from "@/components/layout/AuthNav";
import { ModeSwitch, NavLinks } from "@/components/layout/HeaderNav";

export function Header() {
  return (
    <header className="masthead-rule sticky top-0 z-40 bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-4">
        <span className="flex items-center gap-5">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="font-display text-[1.65rem] font-semibold leading-none tracking-tight text-ink">
              Abhilekh
            </span>
            <span className="hidden font-mono text-[0.66rem] uppercase tracking-[0.16em] text-ink-faint lg:inline">
              India Politics Archive
            </span>
          </Link>
          <ModeSwitch />
        </span>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[0.78rem]">
          <NavLinks />
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
