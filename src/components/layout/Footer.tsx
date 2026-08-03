import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-rule bg-paper-sunken">
      <div className="mx-auto max-w-6xl px-5 py-8 text-[0.8rem] leading-relaxed text-ink-muted">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="max-w-md">
            <p className="font-display text-base font-semibold text-ink">Abhilekh</p>
            <p className="mt-1">
              A crowdsourced, citable record of governance in Indian states. Every published
              fact requires a source and moderator review; every change is versioned.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-1">
            <Link href="/about" className="hover:text-ink">About</Link>
            <Link href="/methodology" className="hover:text-ink">Methodology</Link>
            <Link href="/search" className="hover:text-ink">Search</Link>
            <Link href="/contribute" className="hover:text-ink">Contribute</Link>
          </nav>
        </div>
        <div className="mt-6 border-t border-rule pt-4">
          <p>
            Text content is available under{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              className="underline hover:text-ink"
              rel="license"
            >
              CC BY-SA 4.0
            </a>
            . Map geometry by{" "}
            <a
              href="https://www.npmjs.com/package/@svg-maps/india"
              className="underline hover:text-ink"
            >
              @svg-maps/india
            </a>{" "}
            (CC BY 4.0); boundaries reflect the pre-2019 arrangement and are illustrative,
            not authoritative.
          </p>
        </div>
      </div>
    </footer>
  );
}
