import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "Abhilekh's editorial standard: sourcing requirements, review process, dispute resolution, and known limitations.",
};

export default function MethodologyPage() {
  return (
    <article className="prose-article mx-auto max-w-3xl px-6 pb-12 text-[0.97rem] text-ink">
      <header className="border-b border-rule py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Methodology</h1>
        <p className="mt-3 text-ink-muted">
          The editorial standard every entry in this archive is held to.
        </p>
      </header>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">What counts as a sourced claim</h2>
        <p className="mt-3">
          Every entry must cite at least one source with a title, a working link, and dates
          (publication and access). Acceptable sources, roughly in order of weight:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Primary documents: gazette notifications, court orders and judgments, Election Commission results, CAG and commission reports, assembly records.</li>
          <li>Established news organisations with editorial accountability, in any Indian language.</li>
          <li>Academic work and books from reputable publishers.</li>
        </ul>
        <p>
          Not acceptable as sole sources: social media posts, anonymous blogs, party press
          releases for claims about opponents, and content farms. A claim only one outlet has
          ever made needs stronger sourcing than a widely reported one.
        </p>
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Writing standard</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Neutral, descriptive tone.</strong> Entries describe what happened per the
            sources; they do not editorialise, praise, or condemn.
          </li>
          <li>
            <strong>Attribute, don&rsquo;t assert.</strong> Where a matter is alleged, under
            investigation, or before a court (including anything <em>sub judice</em>),
            entries must say &ldquo;alleged&rdquo;,
            &ldquo;according to&hellip;&rdquo;, or &ldquo;as reported by&hellip;&rdquo;, and
            must not present accusation as conviction. Entries about living people are held to
            the strictest reading of this rule.
          </li>
          <li>
            <strong>Convictions, acquittals, and retractions must be reflected.</strong> If a
            case an entry describes is later decided, the entry should be updated. That is
            what the correction flow is for.
          </li>
        </ul>
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Review standard</h2>
        <p className="mt-3">
          Moderators approve a submission only when: the cited sources actually support each
          stated fact; the tone rules above are met; and the entry is categorised correctly.
          Approval publishes immediately; rejection requires a written reason visible to the
          contributor and in the public log. Moderators see a field-by-field comparison of
          every proposed change against the live record, including conflicts with intervening
          edits.
        </p>
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Disputes &amp; corrections</h2>
        <p className="mt-3">
          Anyone, with or without an account, can report an entry via its{" "}
          <em>Report an issue</em> button. Factual disputes flag the entry publicly while under
          review. Moderators resolve reports with public resolution notes; entries may be
          corrected, marked disputed, or removed (removal leaves a public tombstone and full
          history). People named in entries may use the same mechanism.
        </p>
      </section>

      <section className="border-b border-rule py-8">
        <h2 className="section-label">Licensing</h2>
        <p className="mt-3">
          Text content:{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            className="text-accent underline-offset-2 hover:underline"
            rel="license"
          >
            CC BY-SA 4.0
          </a>
          . Contributors license their submissions under these terms at submission time. Map
          geometry: @svg-maps/india, CC BY 4.0.
        </p>
      </section>

      <section className="py-8">
        <h2 className="section-label">Known limitations</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Map boundaries are pre-2019.</strong> Jammu &amp; Kashmir appears undivided
            (Ladakh has no separate geometry), and Dadra &amp; Nagar Haveli and Daman &amp; Diu
            appear separately despite their 2020 merger. Boundaries are illustrative only.
          </li>
          <li>
            <strong>Coalition governments are colored by the Chief Minister&rsquo;s party</strong>{" "}
            on the map; coalition detail belongs in a term&rsquo;s notes.
          </li>
          <li>
            <strong>Party renames and splits</strong> are separate entries; there is no lineage
            model yet.
          </li>
          <li>
            <strong>State formation dates</strong> in the reference data follow commonly cited
            statehood dates and are being editorially verified; treat them as display metadata
            until sourced inline.
          </li>
          <li>English-only for now.</li>
        </ul>
        <p>
          Found something this page doesn&rsquo;t cover?{" "}
          <Link href="/contribute" className="text-accent underline-offset-2 hover:underline">
            Propose an improvement
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
