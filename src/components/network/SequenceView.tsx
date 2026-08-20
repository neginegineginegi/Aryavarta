import Link from "next/link";

import { EvidenceBadge, RecordSection } from "@/components/network/RecordParts";
import { runsOfSameDate, sequence, whenLabel, type Occurrence } from "@/lib/funding/sequence";

/**
 * One entity's recorded relationships in the order they happened.
 *
 * A peer of the graph, not a replacement for it. The canvas answers "what is
 * this connected to"; this answers "in what order was it recorded to have
 * happened", which is a fact the archive holds whether or not the graph is
 * dense enough for a layout to say anything.
 *
 * The safeguard is stated on the view rather than buried in a footnote,
 * because temporal adjacency reads as causation more readily than almost
 * anything an interface can show. A grant before a board seat is a grant
 * before a board seat.
 *
 * Undated entries are listed after the timeline under their own heading, and
 * the heading says they are undated rather than old. Nothing here is sorted as
 * though a missing date were an early one.
 */

export type SequenceEntry = {
  id: string;
  /** "received funding from", "became a trustee of". Phrased by the caller
   *  from labels.ts, so this component invents no wording of its own. */
  relation: string;
  otherLabel: string;
  otherHref: string | null;
  /** Amount, role, or whatever the row's own detail line is. */
  detail: string | null;
  evidenceStatus: string;
  when: Occurrence;
};

export function SequenceView({ entries, subject }: { entries: SequenceEntry[]; subject: string }) {
  const s = sequence(entries, (e) => e.when, (e) => e.id);
  if (s.datedCount === 0 && s.undatedCount === 0) return null;

  const total = s.datedCount + s.undatedCount;

  return (
    <RecordSection
      title="In order"
      intro={`The ${total} ${total === 1 ? "relationship" : "relationships"} recorded for ${subject}, arranged by when the archive says they happened. Order is recorded here. Consequence is not: that one thing is listed before another says only that, and nothing about whether either caused the other.`}
    >
      {s.datedCount === 0 ? (
        <p className="text-[0.88rem] text-ink-muted">
          The archive holds no dates for any of them, so there is no order to show.
        </p>
      ) : (
        <ol className="seq-years">
          {s.years.map((y) => (
            <li key={y.year} className="seq-year">
              <p className="seq-year-mark">{y.year}</p>
              <ol className="seq-runs">
                {runsOfSameDate(y.entries.filter((e) => e.precision !== "year")).map((run) => (
                  <li key={run[0].item.id} className="seq-run">
                    {/* The date sits above the run rather than repeating on
                        each line: two entries under one date is the only
                        co-occurrence the archive can state without
                        interpreting anything. */}
                    <p className="seq-when">
                      {whenLabel(run[0])}
                      {run.length > 1 && (
                        <span className="seq-same"> · {run.length} recorded on this date</span>
                      )}
                    </p>
                    <ul className="seq-items">
                      {run.map(({ item }) => (
                        <li key={item.id}>
                          <Row entry={item} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {/* Entries known only to the year, gathered under one line.
                    The year mark above already says the year, so repeating
                    "sometime in 2019" per entry would be noise; what the
                    reader needs to know is that no month was recorded, and
                    therefore that these are not ordered against the dated
                    entries above them. */}
                {y.entries.some((e) => e.precision === "year") && (
                  <li className="seq-run">
                    <p className="seq-when">
                      No month recorded
                      {y.entries.some((e) => e.precision !== "year") &&
                        ", so not placed against the entries above"}
                    </p>
                    <ul className="seq-items">
                      {y.entries
                        .filter((e) => e.precision === "year")
                        .map(({ item }) => (
                          <li key={item.id}>
                            <Row entry={item} />
                          </li>
                        ))}
                    </ul>
                  </li>
                )}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {s.undatedCount > 0 && (
        <div className="seq-undated">
          <h3 className="section-label mt-7">{s.undatedCount} recorded without a date</h3>
          <p className="mt-1 max-w-[70ch] text-[0.88rem] text-ink-muted">
            These are not the oldest. The archive holds no date for them, so they cannot be placed
            in the order above, and no date has been guessed for them from the ones that can.
          </p>
          <ul className="seq-items">
            {s.undated.map((e) => (
              <li key={e.id}>
                <Row entry={e} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </RecordSection>
  );
}

function Row({ entry }: { entry: SequenceEntry }) {
  return (
    <p className="seq-line">
      <span className="seq-rel">{entry.relation}</span>{" "}
      {entry.otherHref ? (
        <Link href={entry.otherHref} className="rec-link">
          {entry.otherLabel}
        </Link>
      ) : (
        <span>{entry.otherLabel}</span>
      )}
      {entry.detail && <span className="seq-detail">{entry.detail}</span>}
      <EvidenceBadge status={entry.evidenceStatus} />
    </p>
  );
}
