import {
  isSupportedEntityType,
  type AnyPayload,
  type ElectionPayload,
  type RevisionEntityType,
  type SourceSnapshot,
} from "@/lib/revisions/payloads";
import {
  diffProse,
  diffResults,
  diffScalars,
  diffSources,
  type TextSegment,
} from "@/lib/revisions/diff";
import { EVENT_TYPE_LABELS, formatDate, type EventType } from "@/lib/format";

type Labels = {
  stateNames: Record<string, string>;
  partyNames: Record<string, string>;
};

function displayValue(field: string, value: string | number | null, labels: Labels): string {
  if (value === null || value === "") return "—";
  switch (field) {
    case "stateId":
      return labels.stateNames[String(value)] ?? String(value);
    case "partyId":
      return labels.partyNames[String(value)] ?? String(value);
    case "type":
      return EVENT_TYPE_LABELS[value as EventType] ?? String(value);
    case "kind":
      return (
        {
          presidents_rule: "President's Rule",
          cm: "Chief Minister term",
          pm: "Prime Minister term",
          president: "President term",
          governor: "Governor term",
        }[String(value)] ?? String(value)
      );
    case "startDate":
    case "endDate":
    case "eventDate":
    case "electionDate":
      return formatDate(String(value));
    default:
      return String(value);
  }
}

function Prose({ segments }: { segments: TextSegment[] }) {
  return (
    <span className="whitespace-pre-wrap">
      {segments.map((s, i) =>
        s.kind === "same" ? (
          <span key={i}>{s.text}</span>
        ) : s.kind === "added" ? (
          <ins key={i} className="rounded-xs bg-green-100 px-0.5 text-approved no-underline">
            {s.text}
          </ins>
        ) : (
          <del key={i} className="rounded-xs bg-red-100 px-0.5 text-danger">
            {s.text}
          </del>
        ),
      )}
    </span>
  );
}

function SourceLine({ s }: { s: SourceSnapshot }) {
  return (
    <span>
      <a
        href={s.url}
        target="_blank"
        rel="nofollow noopener noreferrer"
        className="text-accent underline-offset-2 hover:underline"
      >
        {s.title}
      </a>
      {s.publisher ? <span className="text-ink-muted">, {s.publisher}</span> : null}
      {s.publishedOn ? <span className="text-ink-faint">, {formatDate(s.publishedOn)}</span> : null}
    </span>
  );
}

/**
 * The revision diff view — shared by the public revision page and the
 * moderator review page. Fully server-rendered.
 */
export function RevisionDiff({
  entityType,
  action,
  beforeData,
  afterData,
  labels,
}: {
  // The whole database enum: callers pass `revisions.entityType` from a row,
  // and a type with no field map yet must render as an honest "cannot show
  // this" rather than fail to compile the page it appears on.
  entityType: RevisionEntityType;
  action: "create" | "update" | "delete";
  beforeData: AnyPayload | null;
  afterData: AnyPayload | null;
  labels: Labels;
}) {
  if (!isSupportedEntityType(entityType)) {
    return (
      <p className="rounded-sm border border-dashed border-rule-dark bg-paper-sunken px-3 py-2 text-[0.85rem] text-ink-muted">
        This revision covers a {entityType.replace(/_/g, " ")} record. A field-by-field diff for
        that kind of record is not built yet, so the change cannot be shown here.
      </p>
    );
  }
  const rows = diffScalars(entityType, beforeData, afterData);
  const srcDiff = diffSources(
    (beforeData as AnyPayload | null)?.sources,
    (afterData as AnyPayload | null)?.sources,
  );
  const isUpdate = action === "update";

  return (
    <div className="space-y-6">
      {/* Scalar fields */}
      <table className="w-full text-left text-[0.85rem]">
        <thead>
          <tr className="border-b border-rule-dark text-[0.72rem] tracking-[0.04em] text-ink-faint">
            <th className="w-36 py-2 pr-4 font-medium">Field</th>
            {isUpdate ? (
              <>
                <th className="w-[38%] py-2 pr-4 font-medium">Current</th>
                <th className="py-2 font-medium">Proposed</th>
              </>
            ) : (
              <th className="py-2 font-medium">
                {action === "create" ? "Proposed entry" : "Entry proposed for removal"}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const single = action === "create" ? r.after : r.before;
            return (
              <tr
                key={r.field}
                className={`border-b border-rule align-baseline ${isUpdate && r.changed ? "bg-amber-50/60" : ""}`}
              >
                <td className="py-2 pr-4 text-ink-muted">{r.label}</td>
                {isUpdate ? (
                  <>
                    <td className="py-2 pr-4 text-ink-muted">
                      {r.prose && r.changed ? (
                        <Prose
                          segments={diffProse(String(r.before ?? ""), String(r.after ?? "")).filter(
                            (s) => s.kind !== "added",
                          )}
                        />
                      ) : (
                        displayValue(r.field, r.before, labels)
                      )}
                    </td>
                    <td className="py-2 font-medium text-ink">
                      {r.prose && r.changed ? (
                        <Prose
                          segments={diffProse(String(r.before ?? ""), String(r.after ?? "")).filter(
                            (s) => s.kind !== "removed",
                          )}
                        />
                      ) : (
                        <span className={r.changed ? "font-semibold" : "font-normal"}>
                          {displayValue(r.field, r.after, labels)}
                        </span>
                      )}
                    </td>
                  </>
                ) : (
                  <td className={`py-2 ${action === "delete" ? "text-danger line-through decoration-danger/40" : "text-ink"}`}>
                    {r.prose ? (
                      <span className="whitespace-pre-wrap">
                        {displayValue(r.field, single, labels)}
                      </span>
                    ) : (
                      displayValue(r.field, single, labels)
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Election seat results */}
      {entityType === "election" && (
        <div>
          <h3 className="section-label">Seat counts</h3>
          <table className="mt-2 w-auto min-w-72 text-left text-[0.85rem]">
            <thead>
              <tr className="border-b border-rule-dark text-[0.72rem] tracking-[0.04em] text-ink-faint">
                <th className="py-1.5 pr-6 font-medium">Party</th>
                {isUpdate && <th className="py-1.5 pr-6 font-medium">Current</th>}
                <th className="py-1.5 font-medium">{isUpdate ? "Proposed" : "Seats"}</th>
              </tr>
            </thead>
            <tbody>
              {diffResults(
                (beforeData as ElectionPayload | null)?.results,
                (afterData as ElectionPayload | null)?.results,
              ).map((r) => (
                <tr
                  key={r.partyId}
                  className={`border-b border-rule ${isUpdate && r.changed ? "bg-amber-50/60" : ""}`}
                >
                  <td className="py-1.5 pr-6">{labels.partyNames[r.partyId] ?? r.partyId}</td>
                  {isUpdate && (
                    <td className="py-1.5 pr-6 tabular-nums text-ink-muted">
                      {r.beforeSeats ?? "—"}
                    </td>
                  )}
                  <td className="py-1.5 tabular-nums font-medium">
                    {(action === "delete" ? r.beforeSeats : r.afterSeats) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sources */}
      <div>
        <h3 className="section-label">Sources</h3>
        <ul className="mt-2 space-y-1.5 text-[0.85rem]">
          {srcDiff.added.map((s) => (
            <li key={`a-${s.url}`} className="flex gap-2">
              <span className="shrink-0 font-semibold text-approved">
                {action === "create" ? "•" : "+"}
              </span>
              <SourceLine s={s} />
            </li>
          ))}
          {srcDiff.kept.map((s) => (
            <li key={`k-${s.url}`} className="flex gap-2">
              <span className="shrink-0 text-ink-faint">•</span>
              <SourceLine s={s} />
            </li>
          ))}
          {srcDiff.removed.map((s) => (
            <li key={`r-${s.url}`} className="flex gap-2 opacity-70">
              <span className="shrink-0 font-semibold text-danger">−</span>
              <span className="line-through decoration-danger/40">
                <SourceLine s={s} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
