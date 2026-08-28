import Image from "next/image";
import Link from "next/link";

const EXPLORE_LINKS = [
  { href: "/", label: "Map" },
  { href: "/archive", label: "Documents" },
  { href: "/union", label: "Union" },
  { href: "/browse", label: "Browse" },
  { href: "/insights", label: "Insights" },
  { href: "/compare", label: "Compare" },
  { href: "/network", label: "Network" },
  { href: "/network/connect", label: "Connections" },
];

const PROJECT_LINKS = [
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
  { href: "/contribute", label: "Contribute" },
  { href: "/search", label: "Search" },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-rule-dark bg-paper-sunken">
      {/* The last element on the page, so under `viewport-fit=cover` it is the
          one the home indicator lands on. `max()` keeps the existing 40px
          bottom padding on every device without one. */}
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-[0.82rem] leading-relaxed text-ink-muted">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="flex max-w-md items-start gap-3.5">
            {/* Small seal mark (decision 3, 2026-08-28). Decorative here: the
                brand word beside it carries the name, so alt stays empty. */}
            <Image src="/abhilekh-logo.svg" alt="" width={44} height={46} className="mt-1 shrink-0" />
            <div>
              <p lang="sa" className="font-brand text-lg text-ink">
                अभिलेखः
              </p>
              <p className="mt-2">
                A public, crowdsourced record of who governed India, state by state and year
                by year. Every fact cites a source, every edit passes review, and the full
                history of every entry stays open to anyone.
              </p>
            </div>
          </div>
          <div className="flex gap-14">
            <nav aria-label="Explore">
              <p className="section-label">Explore</p>
              <ul className="mt-2.5 space-y-1.5">
                {EXPLORE_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Project">
              <p className="section-label">Project</p>
              <ul className="mt-2.5 space-y-1.5">
                {PROJECT_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
        <div className="mt-8 border-t border-rule pt-4">
          <p>
            Text is available under{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              className="underline hover:text-ink"
              rel="license"
            >
              CC BY-SA 4.0
            </a>
            . Map geometry comes from{" "}
            <a
              href="https://www.npmjs.com/package/@svg-maps/india"
              className="underline hover:text-ink"
            >
              @svg-maps/india
            </a>{" "}
            (CC BY 4.0). Boundaries reflect the pre-2019 arrangement and are illustrative
            rather than authoritative.
          </p>
        </div>
      </div>
    </footer>
  );
}
