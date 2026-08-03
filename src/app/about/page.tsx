import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "What Abhilekh is: a public, sourced, moderated, versioned reference of state politics in India.",
};

export default function AboutPage() {
  return (
    <article className="prose-article mx-auto max-w-3xl px-5 pb-10 text-[0.95rem] text-ink">
      <header className="border-b border-rule py-7">
        <h1 className="font-display text-4xl font-semibold tracking-tight">About Abhilekh</h1>
        <p className="mt-3 text-ink-muted">
          <em>Abhilekh</em> (अभिलेख) — an official record or inscription.
        </p>
      </header>

      <section className="border-b border-rule py-7">
        <h2 className="section-label">What this is</h2>
        <p className="mt-3">
          Abhilekh is a public, crowdsourced reference for the political history of every Indian
          state and union territory: who governed, when, under which party, what elections
          decided it, and what notable governance events — paper leaks, corruption cases, policy
          failures, communal incidents, infrastructure failures — occurred along the way.
        </p>
        <p>
          It exists because this record is scattered across news archives, gazettes, and memory.
          Bringing it into one place, year by year and state by state, makes it possible to ask
          simple questions with sourced answers.
        </p>
      </section>

      <section className="border-b border-rule py-7">
        <h2 className="section-label">How it stays trustworthy</h2>
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
            <strong>Everything is versioned.</strong> Every proposal — accepted, rejected, or
            withdrawn — is a permanent public record showing who proposed what, when, with what
            sources, and how it was decided. See any state&rsquo;s{" "}
            <Link href="/state/tg/history" className="text-accent underline-offset-2 hover:underline">
              history page
            </Link>{" "}
            for an example.
          </li>
        </ul>
        <p>
          The full editorial standard — what counts as a reliable source, how disputes are
          resolved, how corrections work — is documented in the{" "}
          <Link href="/methodology" className="text-accent underline-offset-2 hover:underline">
            methodology
          </Link>
          .
        </p>
      </section>

      <section className="border-b border-rule py-7">
        <h2 className="section-label">Licensing</h2>
        <p className="mt-3">
          All text content on Abhilekh is available under the{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            className="text-accent underline-offset-2 hover:underline"
            rel="license"
          >
            Creative Commons Attribution-ShareAlike 4.0 International
          </a>{" "}
          license — the same family Wikipedia uses. You may reuse and adapt it, including
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

      <section className="py-7">
        <h2 className="section-label">Corrections &amp; grievances</h2>
        <p className="mt-3">
          If an entry about you or your organisation is wrong, use the{" "}
          <em>Report an issue</em> button on that entry — no account is required, and every
          report is reviewed by a moderator with the resolution recorded publicly. Entries under
          active dispute are visibly flagged while review is in progress.
        </p>
      </section>
    </article>
  );
}
