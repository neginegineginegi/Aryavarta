import Link from "next/link";

import { AuthNav } from "@/components/layout/AuthNav";
import { NavLinks } from "@/components/layout/HeaderNav";

/**
 * Masthead. Three zones on one centerline: brand at the left edge, primary
 * nav dead-center on the container axis, account cluster at the right edge.
 * On large screens a 1fr/auto/1fr grid keeps the nav optically centered no
 * matter how wide the brand or account cluster are; below lg the zones wrap
 * in source order and the account cluster keeps to the right edge.
 */
export function Header() {
  return (
    <header className="masthead-rule sticky top-0 z-40 bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="flex items-baseline gap-3 justify-self-start">
          <span lang="sa" className="font-brand text-[1.6rem] leading-none text-ink">
            अभिलेखः
          </span>
          <span className="hidden font-mono text-[0.66rem] uppercase tracking-[0.16em] text-ink-faint xl:inline">
            Indian Political Archive
          </span>
        </Link>
        <nav className="-mx-3 flex flex-wrap items-center gap-y-1 font-mono text-[0.82rem] leading-none justify-self-center">
          <NavLinks />
        </nav>
        {/* Account cluster: pinned to the far edge, visually quieter than
            the primary nav. */}
        <div className="ml-auto lg:ml-0 lg:justify-self-end">
          <AuthNav />
        </div>
      </div>
    </header>
  );
}
