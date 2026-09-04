import { formatDate } from "./format";

/**
 * How a Rajya Sabha row is put into words.
 *
 * Kept out of the page components and tested, because three of these
 * sentences are the difference between the archive stating a fact and the
 * archive implying one it does not hold:
 *
 *  - `Type` is a snapshot taken on 2022-07-20. Rendered bare it reads as the
 *    present tense, so the date travels inside the same sentence, always.
 *  - A party label that resolved to no party row is an ABSENCE with a
 *    reason, not a blank cell.
 *  - The publisher's verbatim label survives even when it did resolve, so a
 *    reader can see what the source actually wrote.
 */

/** Labels that state an absence rather than a party (the ingest ruling of
 *  2026-09-03), with what each one actually means to a reader. */
const ABSENCE: Record<string, string> = {
  "NOM.": "No party recorded — the publisher marks this as a nominated seat.",
  Nominated: "No party recorded — the publisher marks this as a nominated seat.",
  O: "Party not recorded by the publisher.",
};

export type RsPartyDisplay =
  | { kind: "resolved"; verbatim: string; showVerbatim: boolean }
  | { kind: "absence"; verbatim: string; note: string }
  | { kind: "unresolved"; verbatim: string; note: string };

/**
 * What to show in a term's party column.
 *
 * `partyName` is the resolved row's name, null when nothing resolved. The
 * verbatim label is returned in every case; `showVerbatim` is false only when
 * repeating it beside an identical party name would be noise.
 */
export function rsPartyDisplay(partyLabel: string, partyName: string | null): RsPartyDisplay {
  if (partyName !== null) {
    return { kind: "resolved", verbatim: partyLabel, showVerbatim: partyLabel !== partyName };
  }
  const absence = ABSENCE[partyLabel];
  if (absence) return { kind: "absence", verbatim: partyLabel, note: absence };
  return {
    kind: "unresolved",
    verbatim: partyLabel,
    note: "The archive has not resolved this label to a party row, and will not guess: the label stands as the publisher wrote it.",
  };
}

/** `Type` with its snapshot date in the same sentence, never the present tense. */
export function rsTypeSentence(typeSnapshot: "Current" | "Former", snapshotOn: string): string {
  return typeSnapshot === "Current"
    ? `Recorded as a sitting member as of ${formatDate(snapshotOn)}, the date this dataset was taken. Whether the seat is still held today is outside what the archive holds.`
    : `Recorded as a former member as of ${formatDate(snapshotOn)}, the date this dataset was taken.`;
}

/**
 * The scheduled end and the actual end are separate facts. Where they differ,
 * the gap is the story (a resignation, a death, a seat declared vacant), so
 * the sentence names both and the recorded reason.
 */
export function rsEndSentence(
  endDateTerm: string,
  endDateActual: string | null,
  reasonOfVacation: string | null,
): string {
  const scheduled = `Scheduled to end ${formatDate(endDateTerm)}`;
  if (endDateActual === null) {
    return `${scheduled}. No actual vacation date is recorded${reasonOfVacation ? `; reason recorded as “${reasonOfVacation}”` : ""}.`;
  }
  if (endDateActual === endDateTerm) {
    return `${scheduled}, and vacated on that date${reasonOfVacation ? ` — recorded reason: ${reasonOfVacation}` : ""}.`;
  }
  return `${scheduled}; seat actually vacated ${formatDate(endDateActual)}${reasonOfVacation ? ` — recorded reason: ${reasonOfVacation}` : ""}.`;
}

/**
 * URL form of a seat label. The label itself stays the identity — the page
 * resolves a slug by matching it against the labels the database holds — so
 * this only has to be stable and readable, never reversible.
 */
export function rsSeatSlug(stateLabel: string): string {
  return (
    stateLabel
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "unlabelled"
  );
}

/** The coverage boundary, stated the same way wherever it appears. */
export function rsCoverageSentence(snapshotOn: string): string {
  return `This dataset covers March 1952 to ${formatDate(snapshotOn)} and stops there. A member who took a seat after that date is not in the archive at all, and a term still running on that date is recorded only up to it.`;
}
