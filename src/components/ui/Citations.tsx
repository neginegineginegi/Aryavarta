import type { SourceRef } from "@/lib/db/queries/state";
import { formatDate } from "@/lib/format";

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
