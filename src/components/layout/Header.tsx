import Link from "next/link";

import { AuthNav } from "@/components/layout/AuthNav";
import { NavLinks } from "@/components/layout/HeaderNav";
import { MastheadShell } from "@/components/layout/MastheadShell";

/**
 * Masthead. Three zones on one centerline: brand at the left edge, primary
 * nav dead-center on the container axis, account cluster at the right edge.
 * On large screens a 1fr/auto/1fr grid keeps the nav optically centered no
 * matter how wide the brand or account cluster are; below lg the zones wrap
 * in source order and the account cluster keeps to the right edge.
 */
export function Header() {
  return (
    <MastheadShell>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        {/* The wordmark stands alone: no lockup text beside it. */}
        <Link href="/" className="justify-self-start" aria-label="Abhilekh, home">
          <span lang="sa" className="font-brand text-[26px] leading-none text-ink">
            अभिलेखः
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-1 justify-self-center">
          <NavLinks />
        </nav>
        {/* Account cluster: pinned to the far edge, visually quieter than
            the primary nav. */}
        <div className="ml-auto flex items-center gap-3 lg:ml-0 lg:justify-self-end">
          <Link href="/contribute" className="btn btn-primary px-4 py-2 text-[13px]">
            Contribute
          </Link>
          <AuthNav />
        </div>
      </div>
    </MastheadShell>
  );
}
