import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminRemoveButton } from "@/components/admin/AdminRemoveButton";
import { ReferenceList } from "@/components/ui/Citations";
import { PartyTag } from "@/components/ui/PartyTag";
import { getPromise } from "@/lib/db/queries/promises";
import {
  DOCUMENT_TYPE_LABELS,
  PROMISE_CATEGORY_LABELS,
  PROMISE_SCOPE_LABELS,
  formatDate,
  formatNumber,
} from "@/lib/format";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ promiseId: string }>;
}): Promise<Metadata> {
  const { promiseId } = await params;
  const p = await getPromise(promiseId);
  if (!p || p.deletedAt) return {};
  const who = p.partyName ?? "A party";
  return {
    title: `${who}: ${p.officialText.slice(0, 60)}${p.officialText.length > 60 ? "…" : ""}`,
    description: `A promise quoted verbatim from ${p.documentTitle}${
      p.pageRef ? ` (${p.pageRef})` : ""
    }, with its sources.`,
  };
}

export default async function PromisePage({
  params,
}: {
  params: Promise<{ promiseId: string }>;
}) {
  const { promiseId } = await params;
  const p = await getPromise(promiseId);
  if (!p) notFound();

  // Tombstone: the record of a removal stays public, as it does for every
  // other entity in the archive.
  if (p.deletedAt) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="section-label">Removed entry</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-muted">
          A promise quoted from {p.documentTitle}
        </h1>
        <p className="mt-4 max-w-xl text-[0.9rem] text-ink-muted">
          This extraction was removed from the live record through the moderation process on{" "}
          {formatDate(p.deletedAt.slice(0, 10))}. The document it was taken from is still held in
          the archive.
        </p>
        <p className="mt-6">
          <Link
            href={`/archive/${p.documentId}`}
            className="text-accent underline-offset-2 hover:underline"
          >
            View the document →
          </Link>
        </p>
      </div>
    );
  }

  const docKind = DOCUMENT_TYPE_LABELS[p.documentType] ?? "Document";

  return (
    <article className="mx-auto max-w-[900px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-meta">
          <Link href="/archive" className="hover:text-ink">
            Archive
          </Link>
          <span className="mx-1.5">/</span>
          <Link href={`/archive/${p.documentId}`} className="hover:text-ink">
            {docKind}
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">Promise</span>
        </nav>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="type-badge">
            {PROMISE_CATEGORY_LABELS[p.category] ?? p.category}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
            {PROMISE_SCOPE_LABELS[p.scope] ?? p.scope}
            {p.stateName ? ` · ${p.stateName}` : ""}
          </span>
          {p.pageRef && (
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-verify">
              {p.pageRef}
            </span>
          )}
        </div>

        <blockquote
          lang={p.officialLang}
          className="mt-4 font-display text-[clamp(22px,3vw,30px)] font-light leading-[1.3] text-ink"
        >
          &ldquo;{p.officialText}&rdquo;
        </blockquote>

        <p className="mt-4 text-[0.85rem] text-ink-muted">
          {p.partyName ? (
            <PartyTag
              name={p.partyName}
              abbreviation={p.partyAbbreviation}
              color={p.partyColor}
            />
          ) : (
            "Party not recorded"
          )}
          {" · "}
          <Link
            href={`/archive/${p.documentId}`}
            className="underline-offset-2 hover:text-ink hover:underline"
          >
            {p.documentTitle}
          </Link>
          {p.documentPublishedOn ? ` · ${formatDate(p.documentPublishedOn)}` : ""}
        </p>
      </header>

      {p.plainText && (
        <section className="section-card px-6 py-8 sm:px-10">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
            In plain terms, by Abhilekh
          </p>
          <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink">{p.plainText}</p>
          <p className="mt-4 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
            This restatement is editorial. The quoted wording above is the promise as the document
            makes it, and it is the version that governs.
          </p>
        </section>
      )}

      <section className="section-card px-6 py-8 sm:px-10">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">
          As the document states it
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 text-[0.85rem] sm:grid-cols-3">
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
              Timeline
            </dt>
            <dd className="mt-0.5 text-ink">{p.statedTimeline ?? "None stated"}</dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
              Amount
            </dt>
            <dd className="rec-num mt-0.5 text-ink">
              {p.statedBudgetInr ? `₹${formatNumber(p.statedBudgetInr)}` : "None stated"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
              Where in the document
            </dt>
            <dd className="mt-0.5 text-ink">{p.pageRef ?? "Not recorded"}</dd>
          </div>
        </dl>
        <p className="mt-5 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
          Blank fields mean the document itself sets no timeline or figure. Abhilekh does not
          supply one, and does not read an absence as either a strength or a failing.
        </p>
      </section>

      <section className="section-card px-6 py-8 sm:px-10">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">
          Was it kept?
        </h2>
        <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-ink-muted">
          Abhilekh does not answer that. A verdict on a promise is a claim someone makes, and the
          archive&rsquo;s job is to record who made it, when, and on what evidence, not to issue
          one of its own. Attributed claims about this promise will appear here as they are
          contributed and verified, including claims that contradict each other. They will be
          shown side by side and left unresolved.
        </p>
        <p className="mt-4 text-[0.74rem] leading-relaxed text-ink-faint">
          This is also why the archive publishes no scorecards. Counting promises kept and broken
          across a manifesto turns dozens of separate judgments into a single number that hides
          every one of them.
        </p>
      </section>

      <section className="section-card px-6 py-8 sm:px-10">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">Sources</h2>
        {p.sources.length > 0 ? (
          <ReferenceList sources={p.sources} />
        ) : (
          <p className="mt-3 text-[0.9rem] text-ink-muted">
            No sources are recorded beyond the document itself.
          </p>
        )}
        {(p.documentArchiveUrl || p.documentOfficialUrl) && (
          <p className="mt-5 border-t border-rule pt-3 text-[0.82rem]">
            <a
              href={p.documentArchiveUrl ?? p.documentOfficialUrl ?? "#"}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Open {p.documentTitle}
            </a>
            {p.pageRef ? (
              <span className="text-ink-faint"> and check {p.pageRef} for yourself.</span>
            ) : null}
          </p>
        )}
      </section>

      <section className="flex flex-wrap gap-3 py-7 text-[0.85rem]">
        <Link
          href={`/archive/${p.documentId}`}
          className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
        >
          All promises in this document
        </Link>
        {p.partyId && (
          <Link
            href={`/party/${p.partyId}`}
            className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
          >
            {p.partyName ?? "The party"}
          </Link>
        )}
        <span className="self-center">
          <AdminRemoveButton
            entityType="manifesto_promise"
            entityId={p.id}
            label={p.officialText.slice(0, 60)}
          />
        </span>
      </section>
    </article>
  );
}
