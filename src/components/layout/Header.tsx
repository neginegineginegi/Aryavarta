import Link from "next/link";

import { AuthNav } from "@/components/layout/AuthNav";
import { ContributeButton, NavLinks } from "@/components/layout/HeaderNav";
import { MastheadShell } from "@/components/layout/MastheadShell";
import { MobileNav } from "@/components/layout/MobileNav";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * Masthead. Three zones on one centerline: brand at the left edge, primary
 * nav dead-center on the container axis, account cluster at the right edge.
 * On large screens a 1fr/auto/1fr grid keeps the nav optically centered no
 * matter how wide the brand or account cluster are. Below lg the hover nav is
 * replaced wholesale by MobileNav: hover panels do not exist on touch, and
 * letting five triggers wrap made a two-row masthead tall enough to cover the
 * first control of the page it overlapped.
 */
export function Header() {
  return (
    <MastheadShell>
      {/* No wrapping below lg: the nav is hidden there and replaced by
          MobileNav, so the masthead stays one row tall at every width. */}
      <div className="mx-auto flex max-w-6xl items-center gap-x-6 px-6 py-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        {/* The wordmark stands alone: no lockup text beside it. */}
        <Link href="/" className="justify-self-start" aria-label="Abhilekh, home">
          <Wordmark sticky className="text-[26px] leading-none text-ink" />
        </Link>
        <nav className="nav-root hidden items-center gap-x-6 gap-y-1 justify-self-center lg:flex">
          <NavLinks />
        </nav>
        {/* Account cluster: pinned to the far edge, visually quieter than
            the primary nav. */}
        <div className="ml-auto flex items-center gap-3 lg:ml-0 lg:justify-self-end">
          <ContributeButton />
          <div className="hidden lg:block">
            <AuthNav />
          </div>
          <MobileNav />
        </div>
      </div>
    </MastheadShell>
  );
}
