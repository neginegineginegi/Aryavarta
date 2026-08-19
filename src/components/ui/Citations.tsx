import type { DatasetRef, Provenance } from "@/lib/db/queries/provenance";
import type { SourceRef } from "@/lib/db/queries/state";
import { formatDate } from "@/lib/format";
import { PATH_STATEMENT } from "@/lib/ingest/provenance";

/** Superscript footnote markers, e.g. [1][2], linking into a references list. */
export function CiteMarks({
  sources,
  numberOf,
}: {
  sources: SourceRef[];
  numberOf: (sourceId: string) => number;
}) {
  if (sources.length === 0) return null;
  return (
    <span className="whitespace-nowrap">
      {sources.map((s) => {
        const n = numberOf(s.id);
        return (
          <a key={s.id} href={`#source-${n}`} className="cite-ref" aria-label={`Source ${n}`}>
            [{n}]
          </a>
        );
      })}
    </span>
  );
}

/**
 * One numbered reference line. Pure JSX with no hooks, so the same markup
 * serves the static ReferenceList below and the interactive SourceList that
 * opens the Source Explorer, instead of the two drifting apart.
 */
export function SourceEntry({ source, n }: { source: SourceRef; n: number }) {
  return (
    <>
      <span className="shrink-0 tabular-nums text-ink-faint">{n}.</span>
      {/* min-w-0 so a long title wraps instead of pushing a sibling control
          (the Source Explorer trigger) off the edge of the card. */}
      <span className="min-w-0 flex-1">
        <a
          href={source.url}
          rel="nofollow noopener noreferrer"
          target="_blank"
          className="text-accent underline-offset-2 hover:underline"
        >
          {source.title}
        </a>
        {source.publisher ? <>, {source.publisher}</> : null}
        {source.publishedOn ? <>, {formatDate(source.publishedOn)}</> : null}
        {source.accessedOn ? (
          <span className="text-ink-faint"> (accessed {formatDate(source.accessedOn)})</span>
        ) : null}
      </span>
    </>
  );
}

/**
 * One dataset line, for a fact that was loaded in bulk rather than cited row
 * by row.
 *
 * Deliberately the same line as SourceEntry above: linked title first, then
 * publisher, then the dates, in the same type at the same size. A reader
 * should not have to learn a second way of reading where something came from.
 * The version and licence are the parts a citation has no equivalent for, and
 * they carry the weight here, because "CAG State Finances, 2024-25 edition,
 * under GODL-India" is what makes the row checkable by somebody else.
 */
export function DatasetEntry({ dataset, n }: { dataset: DatasetRef; n: number }) {
  return (
    <>
      <span className="shrink-0 tabular-nums text-ink-faint">{n}.</span>
      <span className="min-w-0 flex-1">
        <a
          href={dataset.upstreamUrl}
          rel="nofollow noopener noreferrer"
          target="_blank"
          className="text-accent underline-offset-2 hover:underline"
        >
          {dataset.name}
        </a>
        , {dataset.publisher}
        <>, {dataset.version}</>
        {dataset.licence ? (
          <>
            , under{" "}
            {dataset.licenceUrl ? (
              <a
                href={dataset.licenceUrl}
                rel="nofollow noopener noreferrer"
                target="_blank"
                className="underline-offset-2 hover:underline"
              >
                {dataset.licence}
              </a>
            ) : (
              dataset.licence
            )}
          </>
        ) : null}
        <span className="text-ink-faint">
          {" "}
          {/* The upstream id is printed as the publisher wrote it. Prefixing
              it with "row" produced "row Annexure 14 row 3" the moment a
              publisher's own reference contained the word. */}
          (retrieved {formatDate(dataset.retrievedOn)}
          {dataset.upstreamId ? ` · ${dataset.upstreamId}` : ""})
        </span>
      </span>
    </>
  );
}

/**
 * How a record entered the archive, and the datasets behind it if it came in
 * bulk.
 *
 * Sits above the references list and says one sentence before showing any
 * lines, because "loaded from a published dataset, no person reviewed this
 * row" and "proposed and reviewed by people" are different claims about the
 * same fact and the reader is owed the difference before they read the fact.
 *
 * All four states render, including `unrecorded`. An earlier version of this
 * returned null for that case on the grounds that it was noise, which had it
 * backwards: silence on a legacy row is read as reassurance, and the reader
 * ends up crediting a review that never happened. The archive displays absence
 * as absence here as it does everywhere else.
 *
 * No badge, no colour, no icon. Each state gets the same sentence in the same
 * type at the same weight, because which path a record took is a fact about
 * process and not a rating of the record.
 */
export function ProvenanceNote({ provenance }: { provenance: Provenance }) {
  return (
    <div className="mt-3">
      <p className="text-[0.82rem] leading-relaxed text-ink-muted">
        {PATH_STATEMENT[provenance.path]}
      </p>
      {provenance.datasets.length > 0 && (
        <ol className="mt-1.5 space-y-1.5 text-[0.82rem] leading-relaxed text-ink-muted">
          {provenance.datasets.map((d, i) => (
            <li key={d.slug} id={`dataset-${i + 1}`} className="flex gap-2">
              <DatasetEntry dataset={d} n={i + 1} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Numbered references section, rendered once per article. */
export function ReferenceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1.5 text-[0.82rem] leading-relaxed text-ink-muted">
      {sources.map((s, i) => (
        <li key={s.id} id={`source-${i + 1}`} className="flex gap-2">
          <SourceEntry source={s} n={i + 1} />
        </li>
      ))}
    </ol>
  );
}

/**
 * Builds a stable footnote numbering across an article: sources are numbered
 * in first-appearance order and deduplicated by id.
 */
export function buildCitationIndex(groups: SourceRef[][]): {
  ordered: SourceRef[];
  numberOf: (sourceId: string) => number;
} {
  const ordered: SourceRef[] = [];
  const indexById = new Map<string, number>();
  for (const group of groups) {
    for (const s of group) {
      if (!indexById.has(s.id)) {
        indexById.set(s.id, ordered.length + 1);
        ordered.push(s);
      }
    }
  }
  return {
    ordered,
    numberOf: (sourceId: string) => indexById.get(sourceId) ?? 0,
  };
}
