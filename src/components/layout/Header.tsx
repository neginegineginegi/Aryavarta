import Link from "next/link";

import { AuthNav } from "@/components/layout/AuthNav";
import { NavLinks } from "@/components/layout/HeaderNav";

export function Header() {
  return (
    <header className="masthead-rule sticky top-0 z-40 bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-4">
        <Link href="/" className="flex items-baseline gap-3">
          <span lang="sa" className="font-brand text-[1.6rem] leading-tight text-ink">
            अभिलेखः
          </span>
          <span className="hidden font-mono text-[0.66rem] uppercase tracking-[0.16em] text-ink-faint lg:inline">
            Indian Political Archive
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[0.78rem]">
          <NavLinks />
        </nav>
        {/* Account cluster: pinned to the far edge, visually quieter than
            the primary nav. */}
        <div className="ml-auto">
          <AuthNav />
        </div>
      </div>
    </header>
  );
}
