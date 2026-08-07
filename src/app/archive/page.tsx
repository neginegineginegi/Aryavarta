import type { Metadata } from "next";
import Link from "next/link";

import {
  documentFacets,
  getArchiveCorpusStats,
  searchDocuments,
  type DocumentRow,
} from "@/lib/db/queries/documents";
import { EmptyState } from "@/components/ui/States";
import { DOCUMENT_TYPE_LABELS, formatDate, formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Media archive",
  description:
    "Manifestos, gazettes, audit reports, judgments, budget speeches and other primary documents of Indian elections and governance, searchable and linked to the records they support.",
};

export const revalidate = 300;

function DocRow({ d }: { d: DocumentRow }) {
  const label = DOCUMENT_TYPE_LABELS[d.type] ?? d.type;
  // Prefer our own copy only where redistribution was cleared; otherwise send
  // the reader to the issuer, which is the honest default.
  const href =
    d.redistribution === "permitted" && d.archiveUrl ? d.archiveUrl : d.officialUrl;

  return (
    <tr>
      <td className="py-2.5 pr-4 align-top">
        <span className="type-badge">{label}</span>
      </td>
      <td className="py-2.5 pr-4 align-top">
        <Link
          href={`/archive/${d.id}`}
          className="text-ink underline-offset-2 hover:text-accent hover:underline"
        >
          {d.title}
        </Link>
        <span className="mt-0.5 block text-[12px] text-ink-faint">
          {d.publisher ?? "Publisher not recorded"}
          {d.language !== "en" ? ` · ${d.language.toUpperCase()}` : ""}
          {d.pageCount ? ` · ${d.pageCount} pages` : ""}
          {d.promises > 0
            ? ` · ${d.promises} promise${d.promises === 1 ? "" : "s"} extracted`
            : ""}
          {!d.hasText ? " · metadata only, no text layer" : ""}
        </span>
      </td>
      <td className="rec-num py-2.5 pr-4 align-top whitespace-nowrap text-[13px] text-ink-muted">
        {d.publishedOn ? formatDate(d.publishedOn) : "—"}
      </td>
      <td className="py-2.5 align-top text-right">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className={`font-mono text-[9px] uppercase tracking-[0.14em] underline-offset-2 hover:underline ${
              d.redistribution === "permitted" && d.archiveUrl ? "text-verify" : "text-ink-meta"
            }`}
          >
            {d.redistribution === "permitted" && d.archiveUrl ? "Archived" : "Link only"}
          </a>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
            No link
          </span>
        )}
      </td>
    </tr>
  );
}

function Facet({
  label,
  items,
  param,
  current,
  base,
}: {
  label: string;
  items: Array<{ value: string | number; n: number }>;
  param: string;
  current?: string;
  base: URLSearchParams;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">{label}</p>
      <ul className="mt-2 space-y-1">
        {items.map((it) => {
          const qs = new URLSearchParams(base);
          const v = String(it.value);
          const active = current === v;
          if (active) qs.delete(param);
          else qs.set(param, v);
          return (
            <li key={v}>
              <Link
                href={`/archive${qs.toString() ? `?${qs}` : ""}`}
                className={`flex items-baseline justify-between gap-3 text-[13px] ${
                  active ? "font-medium text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                <span className="truncate">
                  {param === "type" ? (DOCUMENT_TYPE_LABELS[v] ?? v) : v}
                </span>
                <span className="rec-num shrink-0 text-[11px] text-ink-meta">{it.n}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    publisher?: string;
    year?: string;
  }>;
}) {
  const sp = await searchParams;
  const query = {
    q: sp.q?.trim() || undefined,
    type: sp.type || undefined,
    publisher: sp.publisher || undefined,
    year: sp.year ? Number(sp.year) : undefined,
  };
  const [rows, facets, corpus] = await Promise.all([
    searchDocuments(query),
    documentFacets(query),
    getArchiveCorpusStats(),
  ]);

  const base = new URLSearchParams();
  if (query.q) base.set("q", query.q);
  if (query.type) base.set("type", query.type);
  if (query.publisher) base.set("publisher", query.publisher);
  if (query.year) base.set("year", String(query.year));

  const filtered = Boolean(query.q || query.type || query.publisher || query.year);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-4">
      <header className="section-card tricolor-strip px-6 py-9 sm:px-10">
        <nav className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-meta">
          <Link href="/browse" className="hover:text-ink">
            Browse
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">Archive</span>
        </nav>
        <span lang="hi" className="deva-eyebrow mt-4">
          दस्तावेज़ संग्रह
        </span>
        <h1 className="mt-1 font-display text-[clamp(34px,4.5vw,48px)] font-light leading-[1.05] text-ink">
          The media archive
        </h1>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {formatNumber(corpus.total)} documents · {corpus.kinds} kinds ·{" "}
          {formatNumber(corpus.withText)} full-text searchable
        </p>
        <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink-muted">
          Manifestos, gazettes, audit reports, judgments, budget speeches, affidavits and
          debate records: the primary documents behind the archive. Where a document may be
          redistributed, Abhilekh keeps its own copy, because official links rot. Where it may
          not, this points to the issuer.
        </p>
        <form action="/archive" method="get" className="mt-6 flex gap-2">
          {query.type ? <input type="hidden" name="type" value={query.type} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search titles, publishers and document text"
            className="flex-1 rounded-[14px] border border-rule bg-paper-sunken px-4 py-3 text-[16px] outline-none transition-colors focus:border-ink focus:bg-paper-raised"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
      </header>

      <section className="section-card px-6 py-8 sm:px-10">
        {corpus.total === 0 ? (
          <EmptyState
            message="No documents recorded yet."
            helper="The archive fills as moderators add manifestos, gazettes and reports."
            action={{ label: "Contribute a document", href: "/contribute" }}
          />
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row">
            <aside className="lg:w-56 lg:shrink-0">
              {filtered && (
                <Link
                  href="/archive"
                  className="mb-5 inline-block font-mono text-[9px] uppercase tracking-[0.14em] text-accent"
                >
                  Clear filters ×
                </Link>
              )}
              <Facet label="Type" items={facets.types} param="type" current={query.type} base={base} />
              <Facet
                label="Publisher"
                items={facets.publishers}
                param="publisher"
                current={query.publisher}
                base={base}
              />
              <Facet
                label="Year"
                items={facets.years}
                param="year"
                current={query.year ? String(query.year) : undefined}
                base={base}
              />
            </aside>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-[28px] font-light leading-tight text-ink">
                  {filtered ? "Matching documents" : "All documents"}
                </h2>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
                  {formatNumber(facets.total)} of {formatNumber(corpus.total)}
                </span>
              </div>

              {rows.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    message="Nothing matches those filters."
                    helper="Clearing one of them usually widens the result enough to find the document."
                    action={{ label: "Clear filters", href: "/archive" }}
                  />
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="rec-table min-w-[640px] text-[0.88rem]">
                    <thead>
                      <tr>
                        <th className="pr-4">Type</th>
                        <th className="pr-4">Document</th>
                        <th className="pr-4">Published</th>
                        <th className="text-right">Copy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => (
                        <DocRow key={d.id} d={d} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {facets.total > facets.withText && (
                <p className="mt-5 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-meta">
                    Coverage
                  </span>{" "}
                  {formatNumber(facets.withText)} of {formatNumber(facets.total)} documents in
                  this view carry an extracted text layer and can be searched by their contents.
                  The rest are scans, searchable by title, publisher and date only.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
