import type { Metadata } from "next";
import Link from "next/link";

import { ConnectExplorer } from "@/components/network/ConnectExplorer";
import { nodeSummary } from "@/lib/db/queries/network";

export const metadata: Metadata = {
  title: "What connects two entities",
  description:
    "Documented paths and shared connections between any two entities in the archive, each step traceable to its source.",
};

export const dynamic = "force-dynamic";

async function resolve(param: string | undefined) {
  if (!param?.includes(":")) return null;
  const type = param.slice(0, param.indexOf(":"));
  const id = param.slice(param.indexOf(":") + 1);
  const found = await nodeSummary({ type, id });
  return found
    ? { type: found.type, id: found.id, label: found.label, subKind: found.subKind, degree: found.degree }
    : null;
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const [entityA, entityB] = await Promise.all([resolve(a), resolve(b)]);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="text-[0.8rem] text-ink-faint">
          <Link href="/network" className="hover:text-ink">
            Network
          </Link>
        </nav>
        <h1 className="mt-1 font-display text-[clamp(28px,3.4vw,38px)] font-light leading-[1.08]">
          What connects two entities
        </h1>
        <p className="mt-3 max-w-[64ch] text-ink-muted">
          Pick two, and the archive will show every chain of recorded relationships between them
          and everything both are recorded as connected to. Each step opens the document it rests
          on. What any of it means is yours to judge.
        </p>
      </header>

      <section className="section-card mt-4 px-6 py-7 sm:px-10">
        <ConnectExplorer initialA={entityA} initialB={entityB} />
      </section>
    </div>
  );
}
