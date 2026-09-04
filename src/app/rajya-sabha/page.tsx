import type { Metadata } from "next";
import Link from "next/link";

import { getRsIndex, RS_SNAPSHOT_DATE } from "@/lib/db/queries/rajya-sabha";
import { formatDate } from "@/lib/format";
import { rsCoverageSentence, rsSeatSlug } from "@/lib/rajya-sabha-labels";

export const metadata: Metadata = {
  title: "Rajya Sabha",
  description:
    "Members of the Rajya Sabha from 1952 to 20 July 2022: terms, seats, recorded party labels, and how each seat was vacated.",
};

export const revalidate = 3600;

export default async function RajyaSabhaPage() {
  const index = await getRsIndex();

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <p className="section-label">Upper house</p>
        <h1 className="mt-1 font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          The Rajya Sabha
        </h1>
        <p className="mt-3 max-w-2xl text-[0.95rem] text-ink-muted">
          Every recorded member of the Council of States, with each term they held: the seat they
          sat for, the party label the source recorded, when the term was scheduled to end, and
          when the seat was actually vacated.
        </p>
        <p className="mt-3 max-w-2xl text-[0.85rem] leading-relaxed text-ink-faint">
          {rsCoverageSentence(RS_SNAPSHOT_DATE)}
        </p>
      </header>

      {index.members === 0 ? (
        <section className="section-card px-6 py-9 sm:px-10">
          <h2 className="font-display text-[28px] font-light leading-tight text-ink">
            No Rajya Sabha rows in this database yet
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] text-ink-muted">
            The page exists and the tables exist; the ingest that fills them has not been run
            against the database this site is reading. Nothing is missing from the source — there
            is simply nothing here to show yet, and saying so is better than an empty table.
          </p>
        </section>
      ) : (
        <>
          <section className="section-card px-6 py-9 sm:px-10">
            <h2 className="font-display text-[28px] font-light leading-tight text-ink">
              What the archive holds
            </h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <div>
                <dt className="text-[0.78rem] uppercase tracking-wide text-ink-faint">Members</dt>
                <dd className="mt-1 font-display text-3xl font-light tabular-nums text-ink">
                  {index.members.toLocaleString("en-IN")}
                </dd>
              </div>
              <div>
                <dt className="text-[0.78rem] uppercase tracking-wide text-ink-faint">Terms</dt>
                <dd className="mt-1 font-display text-3xl font-light tabular-nums text-ink">
                  {index.terms.toLocaleString("en-IN")}
                </dd>
              </div>
              <div>
                <dt className="text-[0.78rem] uppercase tracking-wide text-ink-faint">
                  Nominated terms
                </dt>
                <dd className="mt-1 font-display text-3xl font-light tabular-nums text-ink">
                  {index.nominatedTerms.toLocaleString("en-IN")}
                </dd>
              </div>
              <div>
                <dt className="text-[0.78rem] uppercase tracking-wide text-ink-faint">
                  Terms with no party recorded
                </dt>
                <dd className="mt-1 font-display text-3xl font-light tabular-nums text-ink">
                  {index.termsWithoutParty.toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>
            <p className="mt-5 max-w-2xl text-[0.85rem] leading-relaxed text-ink-faint">
              {index.earliestStart && index.latestStart ? (
                <>
                  Terms begin between {formatDate(index.earliestStart)} and{" "}
                  {formatDate(index.latestStart)}.{" "}
                </>
              ) : null}
              A term counted under &ldquo;no party recorded&rdquo; is one where the source wrote a
              marker rather than a party, or wrote a label the archive has not resolved to a party
              row. The label it did write is kept on every such term and shown on the member&rsquo;s
              page.
            </p>
          </section>

          <section className="section-card px-6 py-9 sm:px-10">
            <h2 className="font-display text-[28px] font-light leading-tight text-ink">
              Seats represented
            </h2>
            <p className="mt-2 max-w-2xl text-[0.85rem] leading-relaxed text-ink-faint">
              Grouped by the seat exactly as the source names it. The composite seats of the
              1950s — Ajmer and Coorg, Bilaspur and Himachal Pradesh, Manipur and Tripura — are
              their own entities, not early spellings of a modern state, and nominated members sit
              under no state at all.
            </p>
            <ul className="mt-5 divide-y divide-rule">
              {index.groups.map((g) => (
                <li key={g.stateLabel} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
                  <span className="min-w-[16rem] flex-1 text-[0.95rem] text-ink">
                    <Link
                      href={`/rajya-sabha/${rsSeatSlug(g.stateLabel)}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {g.stateLabel}
                    </Link>
                    {g.stateName && g.stateName !== g.stateLabel ? (
                      <span className="ml-2 text-[0.8rem] text-ink-faint">
                        the archive&rsquo;s {g.stateName}
                      </span>
                    ) : null}
                    {!g.stateId ? (
                      <span className="ml-2 text-[0.8rem] italic text-ink-faint">
                        not a state — the seat is recorded, no state row corresponds
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-[0.9rem] text-ink-muted">
                    {g.members.toLocaleString("en-IN")} {g.members === 1 ? "member" : "members"}
                  </span>
                  <span className="tabular-nums text-[0.9rem] text-ink-muted">
                    {g.terms.toLocaleString("en-IN")} {g.terms === 1 ? "term" : "terms"}
                  </span>
                  <span className="tabular-nums text-[0.85rem] text-ink-faint">
                    terms from {g.firstYear === g.lastYear ? g.firstYear : `${g.firstYear}–${g.lastYear}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="section-card px-6 py-9 sm:px-10">
        <h2 className="font-display text-[28px] font-light leading-tight text-ink">
          What this page does not hold
        </h2>
        <ul className="mt-4 space-y-2 text-[0.9rem] leading-relaxed text-ink-muted">
          <li>
            Nothing after {formatDate(RS_SNAPSHOT_DATE)}. The source is a dated release, not a live
            feed, and extending it means ingesting a newer one.
          </li>
          <li>
            Seven terms whose seat the source labels only &ldquo;Others&rdquo; are deliberately not
            loaded. The label is too opaque to place, and a person has to read those rows before
            they can be shown honestly.
          </li>
          <li>
            No biographical detail. The ingest reads thirteen columns and can read no others; the
            release&rsquo;s personal columns — addresses, parentage, dates of birth, contact
            details — are never loaded into this archive.
          </li>
          <li>
            No claim that an RS member and a similarly-named office holder elsewhere in the archive
            are the same person. Where names coincide the archive records a candidate for a human
            to confirm, and until someone does, the pages stay separate.
          </li>
        </ul>
      </section>
    </div>
  );
}
