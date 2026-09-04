import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRsIndex, getRsMembersForSeat, RS_SNAPSHOT_DATE } from "@/lib/db/queries/rajya-sabha";
import { formatDate } from "@/lib/format";
import { rsSeatSlug } from "@/lib/rajya-sabha-labels";

/**
 * Rendered per request, deliberately. A seat page is one indexed query, and
 * caching it for an hour would mean a URL visited before the ingest runs
 * could serve its "not found" from cache long after the rows exist. The
 * index carries the hourly cache; the pages a reader lands on from it are
 * always current.
 */
export const dynamic = "force-dynamic";

/** Resolve a slug back to the seat label the database actually holds, so the
 *  label — not a derived string — stays the identity. */
async function seatFor(slug: string) {
  const index = await getRsIndex();
  const group = index.groups.find((g) => rsSeatSlug(g.stateLabel) === slug);
  return group ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seat: string }>;
}): Promise<Metadata> {
  const { seat } = await params;
  const group = await seatFor(seat);
  if (!group) return {};
  return {
    title: `${group.stateLabel} — Rajya Sabha`,
    description: `Rajya Sabha members recorded for ${group.stateLabel}, ${group.firstYear}–${group.lastYear}.`,
  };
}

export default async function RsSeatPage({ params }: { params: Promise<{ seat: string }> }) {
  const { seat } = await params;
  const group = await seatFor(seat);
  if (!group) notFound();
  const members = await getRsMembersForSeat(group.stateLabel);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <p className="section-label">
          <Link href="/rajya-sabha" className="text-accent underline-offset-2 hover:underline">
            Rajya Sabha
          </Link>{" "}
          · seat
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
          {group.stateLabel}
        </h1>
        <p className="mt-2 text-[0.85rem] text-ink-faint">
          {group.members.toLocaleString("en-IN")} {group.members === 1 ? "member" : "members"} across{" "}
          {group.terms.toLocaleString("en-IN")} {group.terms === 1 ? "term" : "terms"},{" "}
          beginning{" "}
          {group.firstYear === group.lastYear ? group.firstYear : `${group.firstYear}–${group.lastYear}`}.{" "}
          {group.stateId ? (
            group.stateName !== group.stateLabel ? (
              <>
                The seat resolves to{" "}
                <Link
                  href={`/state/${group.stateId}`}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {group.stateName}
                </Link>{" "}
                in the archive.
              </>
            ) : (
              <>
                <Link
                  href={`/state/${group.stateId}`}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  The state&rsquo;s own page
                </Link>{" "}
                holds its elections and office holders.
              </>
            )
          ) : (
            <>This label has no state row in the archive; it is recorded as the source wrote it.</>
          )}{" "}
          Terms are counted up to {formatDate(RS_SNAPSHOT_DATE)}, where the source ends.
        </p>
      </header>

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">Members</h2>
        <ul className="mt-4 divide-y divide-rule">
          {members.map((m) => (
            <li key={m.tcpdRsId} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
              <Link
                href={`/person/rs/${m.tcpdRsId}`}
                className="min-w-[18rem] flex-1 text-[0.95rem] text-accent underline-offset-2 hover:underline"
              >
                {m.memberName}
              </Link>
              <span className="tabular-nums text-[0.85rem] text-ink-muted">
                {m.terms} {m.terms === 1 ? "term" : "terms"}
              </span>
              <span className="tabular-nums text-[0.85rem] text-ink-faint">
                {formatDate(m.firstStart)} – {formatDate(m.lastEnd)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
