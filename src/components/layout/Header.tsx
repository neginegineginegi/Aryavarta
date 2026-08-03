import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Map" },
  { href: "/search", label: "Search" },
  { href: "/contribute", label: "Contribute" },
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
];

export function Header() {
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-6 px-5 py-4">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            Abhilekh
          </span>
          <span className="hidden text-[0.8rem] text-ink-muted sm:inline">
            India State Politics Archive
          </span>
        </Link>
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
          <Link
            href="/login"
            className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
