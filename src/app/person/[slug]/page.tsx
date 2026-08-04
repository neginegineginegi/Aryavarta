import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PartyTag } from "@/components/ui/PartyTag";
import { getPersonBySlug } from "@/lib/db/queries/person";
import { formatTermRange, yearOf } from "@/lib/format";

const OFFICE_LABEL = {
  cm: "Chief Minister",
  pm: "Prime Minister",
  president: "President",
  governor: "Governor",
  presidents_rule: "President's Rule",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const person = await getPersonBySlug(slug);
  if (!person) return {};
  return {
    title: person.name,
    description: `Offices held by ${person.name} across Indian states and the Union, with dates, parties, and sources.`,
  };
}

export default async function PersonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const person = await getPersonBySlug(slug);
  if (!person) notFound();

  return (
    <article className="mx-auto max-w-4xl px-6 pb-12">
      <header className="border-b border-rule py-9">
        <p className="section-label">Office holder</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
          {person.name}
        </h1>
        <p className="mt-2 text-[0.8rem] text-ink-faint">
          Entries are grouped by the name as recorded in approved terms; distinct people sharing
          an identical recorded name would appear together. Every entry links to its sourced
          record.
        </p>
      </header>

      <section className="py-8">
        <h2 className="section-label">Offices held</h2>
        <ul className="mt-4 space-y-4">
          {person.stints.map((s) => (
            <li key={s.termId} className="flex flex-wrap items-baseline gap-x-3 text-[0.95rem]">
              <span className="w-40 shrink-0 tabular-nums text-ink-muted">
                {yearOf(s.startDate)} – {s.endDate ? yearOf(s.endDate) : "present"}
              </span>
              <span className="font-medium text-ink">{OFFICE_LABEL[s.kind]}</span>
              <Link
                href={s.stateId === "in" ? `/union/${yearOf(s.startDate)}` : `/state/${s.stateId}/${yearOf(s.startDate)}`}
                className="text-accent underline-offset-2 hover:underline"
              >
                {s.stateName}
              </Link>
              {s.partyId && (
                <Link href={`/party/${s.partyId}`} className="hover:underline">
                  <PartyTag name={s.partyName} color={s.partyColor} />
                </Link>
              )}
              <span className="text-[0.8rem] text-ink-faint">
                {formatTermRange(s.startDate, s.endDate)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
