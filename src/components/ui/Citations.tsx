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

/** Numbered references section, rendered once per article. */
export function ReferenceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1.5 text-[0.82rem] leading-relaxed text-ink-muted">
      {sources.map((s, i) => (
        <li key={s.id} id={`source-${i + 1}`} className="flex gap-2" >
          <span className="shrink-0 tabular-nums text-ink-faint">{i + 1}.</span>
          <span>
            <a
              href={s.url}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="text-accent underline-offset-2 hover:underline"
            >
              {s.title}
            </a>
            {s.publisher ? <>, {s.publisher}</> : null}
            {s.publishedOn ? <>, {formatDate(s.publishedOn)}</> : null}
            {s.accessedOn ? (
              <span className="text-ink-faint"> (accessed {formatDate(s.accessedOn)})</span>
            ) : null}
          </span>
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
