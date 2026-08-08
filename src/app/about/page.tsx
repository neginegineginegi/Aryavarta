import type { Metadata } from "next";
import Link from "next/link";
import { TricolorRibbon } from "@/components/ui/TricolorRibbon";

export const metadata: Metadata = {
  title: "About",
  description:
    "What Abhilekh is: a public, sourced, moderated, versioned reference of state politics in India.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[900px] px-4 pb-4 text-[0.97rem] text-ink">
      {/* The one interior page allowed the tinted ground and a prism streak:
          it is prose, not data. */}
      <header className="section-card section-tint tricolor-strip relative px-6 py-16 sm:px-10">
        <TricolorRibbon variant="soft" />
        <div className="relative mx-auto max-w-[560px]">
          <span lang="hi" className="deva-eyebrow">
            परिचय
          </span>
          <h1 className="mt-1 font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05]">
            About Abhilekh
          </h1>
          <p className="mt-4 text-ink-muted">
            <em>Abhilekh</em> (अभिलेख): an official record or inscription.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <Link href="/" className="btn btn-primary">
              Explore the map
            </Link>
            <Link href="/contribute" className="btn btn-secondary">
              Contribute
            </Link>
          </div>
        </div>
      </header>
      <div className="prose-article section-card mt-4 px-6 py-10 sm:px-10">

      <section className="border-b border-rule py-7 first:pt-0 last:border-0">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">What this is</h2>
        <p className="mt-3">
          Abhilekh is a public, crowdsourced reference for the political history of every Indian
          state and union territory: who governed, when, under which party, what elections
          decided it, and what happened along the way. Landmark legislation, constitutional
          amendments, court judgments, corruption cases, communal incidents: the events that
          shaped how each state was actually governed.
        </p>
        <p>
          It exists because this record is scattered across news archives, gazettes, and memory.
          Bringing it into one place, year by year and state by state, makes it possible to ask
          simple questions and get sourced answers.
        </p>
      </section>

      <section className="border-b border-rule py-7 first:pt-0 last:border-0">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">How it stays trustworthy</h2>
        <p className="mt-3">
          Three rules, enforced by the software rather than by promise:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Everything is sourced.</strong> A submission without at least one citation
            (title, link, date) is rejected before it reaches a human.
          </li>
          <li>
            <strong>Everything is reviewed.</strong> No contribution touches the public record
            until a moderator has compared it, field by field, against the live version and its
            sources.
          </li>
          <li>
            <strong>Everything is versioned.</strong> Every proposal becomes a permanent public
            record, whether it was accepted, rejected, or withdrawn. It shows who proposed
            what, when, with what sources, and how it was decided. See any state&rsquo;s{" "}
            <Link href="/state/tg/history" className="text-accent underline-offset-2 hover:underline">
              history page
            </Link>{" "}
            for an example.
          </li>
        </ul>
        <p>
          The full editorial standard lives in the{" "}
          <Link href="/methodology" className="text-accent underline-offset-2 hover:underline">
            methodology
          </Link>
          : what counts as a reliable source, how disputes are resolved, and how corrections
          work.
        </p>
      </section>

      <section className="border-b border-rule py-7 first:pt-0 last:border-0">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">Licensing</h2>
        <p className="mt-3">
          All text content on Abhilekh is available under the{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            className="text-accent underline-offset-2 hover:underline"
            rel="license"
          >
            Creative Commons Attribution-ShareAlike 4.0 International
          </a>{" "}
          license, the same family Wikipedia uses. You may reuse and adapt it, including
          commercially, provided you credit Abhilekh and share derivatives under the same terms.
          By contributing, you agree to publish your contribution under this license.
        </p>
        <p>
          Map geometry is from{" "}
          <a
            href="https://www.npmjs.com/package/@svg-maps/india"
            className="text-accent underline-offset-2 hover:underline"
          >
            @svg-maps/india
          </a>{" "}
          (CC BY 4.0). Boundaries shown are illustrative, reflect the pre-2019 arrangement, and
          imply no position on any boundary question.
        </p>
      </section>

      <section className="py-7 last:border-0">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">Corrections &amp; grievances</h2>
        <p className="mt-3">
          If an entry about you or your organisation is wrong, use the{" "}
          <em>Report an issue</em> button on that entry. No account is required. A moderator
          reviews every report, and the resolution is recorded publicly. Entries under active
          dispute are visibly flagged while review is in progress.
        </p>
      </section>
      </div>
    </article>
  );
}