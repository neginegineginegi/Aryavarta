import Link from "next/link";

import { FaqAccordion, type Faq } from "@/components/home/FaqAccordion";
import { MapPanel } from "@/components/map/MapPanel";
import { db } from "@/lib/db";
import { getMapData, getUnionMapData } from "@/lib/db/queries/map";
import { getArchiveStats } from "@/lib/db/queries/stats";
import { revisions } from "@/lib/db/schema";
import { formatNumber } from "@/lib/format";
import { and, desc, eq } from "drizzle-orm";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { TricolorRibbon } from "@/components/ui/TricolorRibbon";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * The landing page, built to the Abhilekh design handoff: every section is a
 * rounded card floating on the page ground, with the blurred tricolor streak
 * as the signature on the tinted sections.
 *
 * Where the handoff carries placeholder figures, this reads the real archive
 * instead. Nothing here states a number the database cannot account for.
 */

const FIRST_YEAR = 1947;

const FAQS: Faq[] = [
  {
    q: "Where does the information come from?",
    a: "From published sources: Election Commission of India reports, official gazettes, legislature records, and reputable news archives. Every entry links to the source it was drawn from. If a fact has no citation, it does not appear.",
  },
  {
    q: "Who checks the entries?",
    a: "Volunteer moderators review every submission before it is published. Moderators are named on the site, and their decisions are logged in the same public history as the edits themselves.",
  },
  {
    q: "Can I fix a mistake?",
    a: "Yes. Anyone can submit a correction, provided it cites a published source. It enters a review queue, a moderator verifies it against the source, and once approved it goes live with your contribution recorded.",
  },
  {
    q: "Is anything ever deleted?",
    a: "No. When an entry is corrected, the previous version stays in the public edit history along with who changed it, when, and why. The archive keeps its own record.",
  },
  {
    q: "Does it cover President's Rule and interim periods?",
    a: "Yes. Periods of President's Rule, acting chief ministers, and caretaker governments are recorded as distinct entries, since these are exactly the periods reference lists tend to blur.",
  },
  {
    q: "Is Abhilekh politically neutral?",
    a: "The archive records who held office, when, and what happened, with sources. It carries no commentary, rankings, or editorial judgment. Disputes are resolved by what the cited sources say.",
  },
  {
    q: "How is it funded, and what does it cost?",
    a: "It is free, with no accounts, ads, or paid tiers. The project runs on volunteer time, and the data is published openly under a CC BY-SA license.",
  },
];

/** Recent approved revisions, shown as the audit log the handoff sketches. */
async function recentAudit() {
  const rows = await db
    .select({ title: revisions.title, entityType: revisions.entityType })
    .from(revisions)
    .where(and(eq(revisions.status, "approved")))
    .orderBy(desc(revisions.createdAt))
    .limit(4);
  return rows;
}

export default async function HomePage() {
  // Note: the ?y= year param is read client-side inside MapExplorer so this
  // page stays fully static/cached.
  // Both map payloads: each is small and separately cached, and holding both
  // is what lets States/Union swap in place instead of navigating.
  const [data, unionData, stats, audit] = await Promise.all([
    getMapData(),
    getUnionMapData(),
    getArchiveStats(),
    recentAudit(),
  ]);
  const years = new Date().getFullYear() - FIRST_YEAR;

  const statItems = [
    { value: formatNumber(stats.states), label: "States, UTs & the Union" },
    { value: String(years), label: "Years of record" },
    { value: formatNumber(stats.terms), label: "Government terms recorded" },
    { value: formatNumber(stats.sources), label: "Sources cited" },
  ];

  // Terms per decade, drawn from the map data already loaded.
  const decades = Array.from({ length: 8 }, (_, i) => FIRST_YEAR + i * 10);
  const perDecade = decades.map((start) => ({
    label: `'${String(start).slice(2)}`,
    n: data.terms.filter((t) => {
      const y = Number(t.startDate.slice(0, 4));
      return y >= start && y < start + 10;
    }).length,
  }));
  const peak = Math.max(1, ...perDecade.map((d) => d.n));

  return (
    <>
      {/* ---------------------------------------------------------------- HERO
          Outside the max-width container on purpose: the tricolor reaches the
          viewport edges and the surface runs unbroken from the top of the
          page, through the masthead, into the headline. Every later section
          resumes the inset card rhythm below. */}
      {/* svh, not vh and not dvh. `vh` is iOS Safari's LARGE viewport, so at
          82vh the hero came within a few percent of filling a phone that still
          had its toolbars up, and the scroll cue below it fell off the screen.
          `dvh` fixes the height but re-measures as the toolbar collapses, which
          would grow the hero mid-scroll and shove the rest of the page down
          under the reader's thumb. `svh` is the toolbars-showing height: never
          too tall, and it never moves. */}
      <section className="hero-bleed section-card section-tint-hero relative flex min-h-[82svh] flex-col">
        <TricolorRibbon variant="wide" />
        <TricolorRibbon variant="sharp" />

        <div className="relative flex justify-end px-6 pt-7 sm:px-9">
          {/* The one label on the site still set in capitals, because the
              design mock has it that way. Its tracking stays at 0.12em, which
              is what capitals need; everywhere else dropped to 0.06em when it
              went to sentence case. */}
          <p className="text-right font-mono text-[10px] uppercase leading-[1.7] tracking-[0.12em] text-ink-meta">
            {"// the record"}
            <br />
            every state &gt; every year
            <br />
            every fact &gt; a citation
            <br />
            every change &gt; reviewed
            <br />
            {`// since ${FIRST_YEAR}`}
          </p>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
          <p className="mb-3.5">
            <Wordmark className="text-[22px] text-ink-muted" />
          </p>
          <h1 className="display-1 m-0 mb-9 text-ink">
            The public record
            <br />
            of Indian government
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Link href="#map" className="btn btn-primary">
              Explore the map
            </Link>
            <Link href="/browse" className="btn btn-secondary">
              Browse the archive
            </Link>
          </div>
          {/* Reads as prose without an affordance, so it carries a chevron
              that leans further right on hover. Drawn, not a "›" character:
              a glyph sits on the text baseline and lands at a different size
              and height on every platform font. */}
          <Link
            href="/contribute"
            className="group mt-[18px] inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition-colors hover:text-accent"
          >
            Contribute a sourced correction
            <svg
              aria-hidden
              width="7"
              height="10"
              viewBox="0 0 7 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            >
              <path d="M1.4 1.2 5.2 5l-3.8 3.8" />
            </svg>
          </Link>
          <p className="mt-11 max-w-[520px] text-[16px] text-[#3a3a36]">
            Who governed every Indian state, union territory and the Union, year by year since{" "}
            {FIRST_YEAR}.
          </p>
          <p className="mt-2 text-[15px] text-ink-faint">
            Chief ministers, prime ministers, governors, elections, and the events that defined
            each period.
          </p>
        </div>

        <p className="relative pb-7 text-center font-mono text-[10px] tracking-[0.2em] text-ink-meta">
          Free · Public · Sourced
        </p>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 pb-4 pt-4">
      {/* ----------------------------------------------------------------- MAP */}
      <section id="map" className="section-card scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto mb-12 max-w-[640px] text-center">
          <span className="eyebrow">The map</span>
          <h2 className="display-2 mx-0 mb-4 mt-5 text-ink">
            Every government,
            <br />
            on one timeline.
          </h2>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-soft">
            Drag the year and watch the map change. Each state takes the colour of the party in
            office on 31 December of that year. Switch to Union for the government at the centre.
            Open any state for its full record.
          </p>
        </div>
        <MapPanel states={data} union={unionData} />
      </section>

      {/* ------------------------------------------------------------ FEATURES */}
      <section className="section-card px-6 py-20 sm:py-24">
        <div className="mx-auto mb-16 max-w-[640px] text-center">
          <span className="eyebrow">The archive</span>
          <h2 className="display-2 mx-0 mb-4 mt-5 text-ink">
            Complete coverage.
            <br />
            Verifiable by design.
          </h2>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-soft">
            Every entry in Abhilekh is drawn from a published source and reviewed before it
            appears. Nothing is anonymous, and nothing disappears.
          </p>
        </div>

        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-5 md:grid-cols-2">
          {/* Coverage */}
          <div className="flex flex-col gap-5 rounded-[20px] bg-paper-sunken p-8">
            <div
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[18px] text-accent shadow-card"
            >
              ▦
            </div>
            <div>
              <p className="mb-2 font-display text-[24px] text-accent">Coverage</p>
              <p className="text-[19px] font-medium leading-[1.4] text-ink">
                Every seat of government, every year since Independence.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 text-[14px] text-ink-soft">
              <p>
                <strong className="text-ink">{stats.states}</strong> states and union territories,
                plus the Union
              </p>
              <p>
                <strong className="text-ink">{years}</strong> years of continuous record,{" "}
                {FIRST_YEAR} to today
              </p>
              <p>
                <strong className="text-ink">{formatNumber(stats.elections)}</strong> general and
                assembly elections documented
              </p>
            </div>
            <Link href="#map" className="btn btn-secondary btn-sm self-start">
              Explore the map
            </Link>
            <div className="mt-1 rounded-[14px] bg-white p-5">
              <p className="mono-micro mb-3.5">● Terms by decade</p>
              {/* Bars are direct flex children so their percentage heights
                  resolve against the fixed track; labels sit in their own row
                  below so they never eat into it. */}
              <div className="flex h-[90px] items-end gap-1.5">
                {perDecade.map((d) => (
                  <div
                    key={d.label}
                    className="flex-1 rounded-t-[3px]"
                    style={{
                      height: `${Math.max(4, Math.round((d.n / peak) * 100))}%`,
                      backgroundImage:
                        "repeating-linear-gradient(90deg,#fdba74 0 2px,transparent 2px 5px)",
                    }}
                    title={`${d.label}s: ${d.n} terms recorded`}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {perDecade.map((d) => (
                  <span
                    key={d.label}
                    className="flex-1 text-center font-mono text-[8px] text-ink-meta"
                  >
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className="flex flex-col gap-5 rounded-[20px] bg-paper-sunken p-8">
            <div
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[18px] text-verify shadow-card"
            >
              ✓
            </div>
            <div>
              <p className="mb-2 font-display text-[24px] text-verify">Verification</p>
              <p className="text-[19px] font-medium leading-[1.4] text-ink">
                Every fact cited. Every change reviewed and kept forever.
              </p>
            </div>
            <div className="flex flex-col gap-2.5 text-[14px] text-ink-soft">
              <p>
                <strong className="text-ink">Cited:</strong> each entry links to a published source
              </p>
              <p>
                <strong className="text-ink">Moderated:</strong> corrections reviewed before
                publication
              </p>
              <p>
                <strong className="text-ink">Permanent:</strong> a public edit history that never
                deletes
              </p>
            </div>
            <Link href="/methodology" className="btn btn-secondary btn-sm self-start">
              How review works
            </Link>
            <div className="mt-1 flex flex-col rounded-[14px] bg-white p-5">
              {audit.length > 0 ? (
                audit.map((r, i) => (
                  <div
                    key={`${r.title}-${i}`}
                    className="flex items-center justify-between gap-3 border-b border-rule-light py-[9px] font-mono text-[10px] last:border-0"
                  >
                    <span className="truncate text-ink-muted">{r.title}</span>
                    <span className="shrink-0 text-verify">✓ Approved</span>
                  </div>
                ))
              ) : (
                <p className="py-2 font-mono text-[10px] text-ink-meta">
                  NO APPROVED REVISIONS YET
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- STATS */}
      <section className="section-card px-6 py-16">
        <div className="mx-auto grid max-w-[1000px] grid-cols-2 gap-4 text-center lg:grid-cols-4">
          {statItems.map((s) => (
            <div key={s.label} className="px-3 py-6">
              <p className="stat-value text-ink">
                <RollingNumber value={s.value} />
              </p>
              <p className="stat-label">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------------- ABOUT */}
      <section id="about" className="section-card section-tint relative px-6 py-24 sm:py-28">
        <TricolorRibbon variant="soft" />
        <div className="relative mx-auto max-w-[560px] text-[15.5px] leading-[1.75] text-ink-body">
          <p className="lede mb-[22px]">
            Every country keeps records of what its governments did. Far fewer keep an accessible
            record of who governed, assembled in one place, year by year, checkable by anyone.
          </p>
          <p className="mb-[22px]">
            In India that record is scattered across gazettes, election commission reports,
            newspaper archives and half-maintained lists. Ask a simple question, like who was the
            chief minister of Bihar in 1990, or what happened in the 1996 general election. The
            answer exists, but rarely with a source attached.
          </p>
          <p className="mb-[22px] text-ink-muted">
            Abhilekh puts that record in one place. Every officeholder, every election, every
            period of President&rsquo;s Rule, from 15 August {FIRST_YEAR} to today, each entry
            citing the published source it came from.
          </p>
          <p className="m-0 text-ink-faint">
            It is maintained by volunteers and moderators, free to read, and free of anything to
            buy. The Sanskrit word <em>abhilekha</em> means an inscription: a record made to last.
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section id="faq" className="section-card relative px-6 py-20 sm:py-24">
        <TricolorRibbon variant="faq" />
        <div className="relative mx-auto mb-12 max-w-[520px] text-center">
          <span className="eyebrow">FAQ</span>
          <h2 className="display-2 mx-0 mb-3.5 mt-5 text-ink">
            Frequently
            <br />
            asked questions
          </h2>
          <p className="m-0 text-[14px] text-ink-faint">
            Quick answers on sourcing, moderation, and how to contribute.
          </p>
        </div>
        <div className="relative">
          <FaqAccordion items={FAQS} />
        </div>
      </section>

      {/* ----------------------------------------------------------------- CTA */}
      <section className="section-card section-tint relative px-6 py-28 text-center sm:py-32">
        <TricolorRibbon variant="reverse" />
        <div className="relative">
          <h2 className="display-3 mx-0 mb-7 mt-0 text-ink">
            Start with
            <br />
            a question.
          </h2>
          <Link href="/search" className="btn btn-primary">
            Search the archive
          </Link>
        </div>
      </section>
      </div>
    </>
  );
}
