import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PartyTag } from "@/components/ui/PartyTag";
import { getDocument } from "@/lib/db/queries/documents";
import { getPromisesForDocument, type PromiseRow } from "@/lib/db/queries/promises";
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
  params: Promise<{ documentId: string }>;
}): Promise<Metadata> {
  const { documentId } = await params;
  const doc = await getDocument(documentId);
  if (!doc) return {};
  const kind = DOCUMENT_TYPE_LABELS[doc.type] ?? "Document";
  return {
    title: doc.title,
    description: `${kind}${doc.publisher ? ` issued by ${doc.publisher}` : ""}${
      doc.publishedOn ? `, ${formatDate(doc.publishedOn)}` : ""
    }. Held in the Abhilekh media archive with its citations.`,
  };
}

/**
 * One extracted promise, rendered as a quotation.
 *
 * The manifesto's own wording comes first and is never paraphrased in place.
 * Any editorial restatement sits below it under an explicit label, so a reader
 * can always tell the party's words from ours.
 */
function PromiseEntry({ p, n }: { p: PromiseRow; n: number }) {
  return (
    <li id={`promise-${n}`} className="border-t border-rule py-6 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rec-num text-[11px] text-ink-meta">{n}</span>
        <span className="type-badge">
          {PROMISE_CATEGORY_LABELS[p.category] ?? p.category}
        </span>
        {p.scope !== "unspecified" && (
          <span className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
            {PROMISE_SCOPE_LABELS[p.scope] ?? p.scope}
            {p.stateName ? ` · ${p.stateName}` : ""}
          </span>
        )}
        {p.pageRef && (
          <span className="font-mono text-[9px] tracking-[0.06em] text-verify">
            {p.pageRef}
          </span>
        )}
      </div>

      <blockquote
        lang={p.officialLang}
        className="mt-3 border-l-2 border-rule-dark pl-4 text-[1rem] leading-relaxed text-ink"
      >
        {p.officialText}
      </blockquote>

      {p.plainText && (
        <div className="mt-3 pl-4">
          <p className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
            In plain terms, by Abhilekh
          </p>
          <p className="mt-1 text-[0.9rem] leading-relaxed text-ink-muted">{p.plainText}</p>
        </div>
      )}

      {(p.statedTimeline || p.statedBudgetInr) && (
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 pl-4 text-[0.82rem]">
          {p.statedTimeline && (
            <div>
              <dt className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
                Timeline as stated
              </dt>
              <dd className="text-ink-muted">{p.statedTimeline}</dd>
            </div>
          )}
          {p.statedBudgetInr && (
            <div>
              <dt className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
                Amount as stated
              </dt>
              <dd className="rec-num text-ink-muted">₹{formatNumber(p.statedBudgetInr)}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-4 text-[0.78rem]">
        <Link href={`/promise/${p.id}`} className="cite-marker">
          Record and sources
        </Link>
        {p.sources.length > 0 && (
          <span className="text-ink-faint">
            {p.sources.length} source{p.sources.length === 1 ? "" : "s"}
          </span>
        )}
      </p>
    </li>
  );
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const doc = await getDocument(documentId);
  if (!doc) notFound();

  const promises = await getPromisesForDocument(doc.id);
  const kind = DOCUMENT_TYPE_LABELS[doc.type] ?? "Document";
  const hasText = Boolean(doc.fullText && doc.fullText.length > 0);
  const archived = doc.redistribution === "permitted" && doc.archiveUrl;

  // Group by subject heading, keeping the manifesto's own order within each.
  const byCategory = new Map<string, PromiseRow[]>();
  for (const p of promises) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  let counter = 0;

  return (
    <article className="mx-auto max-w-[1000px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="font-mono text-[10px] tracking-[0.06em] text-ink-meta">
          <Link href="/browse" className="hover:text-ink">
            Browse
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/archive" className="hover:text-ink">
            Archive
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{kind}</span>
        </nav>
        <span lang="hi" className="deva-eyebrow mt-4">
          दस्तावेज़
        </span>
        <h1 className="mt-1 font-display text-[clamp(28px,3.8vw,42px)] font-light leading-[1.08] text-ink">
          {doc.title}
        </h1>
        <p className="mt-3 text-[0.9rem] text-ink-muted">
          {doc.publisher ?? "Publisher not recorded"}
          {doc.publishedOn ? ` · ${formatDate(doc.publishedOn)}` : ""}
          {doc.party ? " · " : ""}
          {doc.party ? (
            <PartyTag
              name={doc.party.name}
              abbreviation={doc.party.abbreviation}
              color={doc.party.color}
              short
            />
          ) : null}
          {doc.state ? ` · ${doc.state.name}` : ""}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          {archived && doc.archiveUrl && (
            <a
              href={doc.archiveUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="btn btn-primary"
            >
              Read the archived copy
            </a>
          )}
          {doc.officialUrl && (
            <a
              href={doc.officialUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="btn btn-secondary"
            >
              {archived ? "Issuer's copy" : "Read at the issuer"}
            </a>
          )}
        </div>
      </header>

      <section className="section-card px-6 py-8 sm:px-10">
        <h2 className="font-display text-[26px] font-light leading-tight text-ink">
          About this document
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-4 text-[0.85rem] sm:grid-cols-4">
          <div>
            <dt className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
              Kind
            </dt>
            <dd className="mt-0.5 text-ink">{kind}</dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
              Language
            </dt>
            <dd className="mt-0.5 text-ink">{doc.language.toUpperCase()}</dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
              Pages
            </dt>
            <dd className="rec-num mt-0.5 text-ink">
              {doc.pageCount ? formatNumber(doc.pageCount) : "Not recorded"}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[9px] tracking-[0.06em] text-ink-meta">
              Copy held
            </dt>
            <dd className="mt-0.5 text-ink">{archived ? "Yes" : "Link only"}</dd>
          </div>
        </dl>
        {doc.notes && (
          <p className="mt-5 max-w-2xl text-[0.88rem] leading-relaxed text-ink-muted">
            {doc.notes}
          </p>
        )}
        <p className="mt-5 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
          {archived
            ? "Redistribution of this document was cleared, so Abhilekh keeps its own copy. Official links rot; the issuer's link is kept alongside it."
            : "Redistribution of this document was not cleared, so Abhilekh records its details and points to the issuer rather than hosting it."}
          {hasText
            ? " Its text has been extracted, so the archive search reaches inside it."
            : " Its text has not been extracted, so it is searchable by title, publisher and date only."}
        </p>
      </section>

      {promises.length > 0 && (
        <section className="section-card px-6 py-9 sm:px-10">
          <span lang="hi" className="deva-eyebrow">
            घोषणाएँ
          </span>
          <h2 className="mt-1 font-display text-[30px] font-light leading-tight text-ink">
            What this document promises
          </h2>
          <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-ink-muted">
            {formatNumber(promises.length)} promise{promises.length === 1 ? "" : "s"} quoted from
            this document, each with the page it was taken from so you can check it against the
            original. Abhilekh does not say whether any of them was kept. Whether a promise was
            met is a claim someone makes, dated and attributed, and it is recorded as such on the
            promise&rsquo;s own page.
          </p>

          {[...byCategory.entries()].map(([category, list]) => (
            <div key={category} className="mt-8">
              <h3 className="font-mono text-[10px] tracking-[0.06em] text-ink-soft">
                {PROMISE_CATEGORY_LABELS[category] ?? category}
                <span className="ml-2 text-ink-meta">{list.length}</span>
              </h3>
              <ul className="mt-4">
                {list.map((p) => {
                  counter += 1;
                  return <PromiseEntry key={p.id} p={p} n={counter} />;
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {promises.length === 0 && doc.type === "manifesto" && (
        <section className="section-card px-6 py-9 text-center sm:px-10">
          <p className="text-[0.95rem] text-ink-muted">
            No promises have been extracted from this manifesto yet.
          </p>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            Extraction is manual and quotes the document verbatim, with a page reference for every
            entry.
          </p>
          <Link
            href={`/contribute/manifesto_promise?document=${doc.id}`}
            className="btn btn-secondary mt-5"
          >
            Quote a promise from this document
          </Link>
        </section>
      )}

      <section className="flex flex-wrap gap-3 py-7 text-[0.85rem]">
        <Link
          href="/archive"
          className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
        >
          Back to the archive
        </Link>
        <Link
          href={`/contribute/manifesto_promise?document=${doc.id}`}
          className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
        >
          Quote a promise from this document
        </Link>
        {doc.electionId && (
          <Link
            href={`/election/${doc.electionId}`}
            className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
          >
            The election it belongs to
          </Link>
        )}
      </section>
    </article>
  );
}
