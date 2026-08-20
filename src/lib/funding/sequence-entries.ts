/**
 * Record rows to sequence entries.
 *
 * Shared by the organisation and person pages so both phrase a relationship
 * the same way, and so the wording keeps coming from labels.ts rather than
 * being retyped per page. Every phrase states the recorded relation and stops:
 * "received funding from", never "was funded to".
 *
 * `financialYear` is the only field here that needs an argument. It is a
 * reporting period, not a date, and "2015-16" is not a day. It is read only
 * for the year, and only when no date exists, and the view then says "sometime
 * in 2015" rather than implying the archive knows more than that. The
 * alternative was to leave such a row undated, which would be honest but would
 * empty the timeline: most FCRA filings are reported by year and nothing else.
 */

import { EDGE_KIND_LABELS, formatAmount } from "@/lib/funding/labels";
import type { Occurrence } from "@/lib/funding/sequence";
import type { SequenceEntry } from "@/components/network/SequenceView";

/** "2015-16" or "2015-2016" or "2015". The first four digits are the year the
 *  period opens in; anything else is not a financial year and yields null. */
export function financialYearStart(fy: string | null | undefined): number | null {
  if (!fy) return null;
  const m = /^(\d{4})/.exec(fy.trim());
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1600 && y <= 2200 ? y : null;
}

function when(on: string | null | undefined, fy?: string | null): Occurrence {
  return { on: on ? on.slice(0, 10) : null, year: on ? null : financialYearStart(fy) };
}

export type TxRowish = {
  id: string;
  amount: string | null;
  currency: string | null;
  financialYear: string | null;
  occurredOn: string | null;
  statedPurpose: string | null;
  evidenceStatus: string;
};

// Generic over the caller's row so `other` sees the real columns: an org page
// reaches for donorType, a person page for recipientId, and neither belongs in
// the shape this module requires.
export function fundingEntries<T extends TxRowish>(
  rows: T[],
  direction: "received" | "given",
  other: (r: T) => { label: string; href: string | null },
): SequenceEntry[] {
  return rows.map((t) => {
    const o = other(t);
    const amount = formatAmount(t.amount, t.currency);
    return {
      id: `tx:${t.id}`,
      relation: direction === "received" ? "received funding from" : "gave funding to",
      otherLabel: o.label,
      otherHref: o.href,
      // The purpose is quoted, never paraphrased, exactly as the funding
      // section does it.
      detail: [amount, t.statedPurpose ? `for "${t.statedPurpose}"` : null]
        .filter(Boolean)
        .join(" ") || null,
      evidenceStatus: t.evidenceStatus,
      when: when(t.occurredOn, t.financialYear),
    };
  });
}

export type BoardRowish = {
  id: string;
  role: string;
  roleKind: string;
  startOn: string | null;
  endOn: string | null;
  evidenceStatus: string;
};

export function boardEntries<T extends BoardRowish>(
  rows: T[],
  side: "person" | "org",
  other: (r: T) => { label: string; href: string | null },
): SequenceEntry[] {
  return rows.map((b) => {
    const o = other(b);
    // The board label reads "sits on the board of X", which is the person's
    // side of it. On an organisation page the subject is X, so the phrase is
    // turned around rather than left saying the opposite of what happened.
    // A role kind with no phrase in labels.ts must not become its own bare
    // enum value: "other Reliance Foundation" is not a sentence. The role's
    // own text is already in the detail line, so the verb stays neutral.
    const asPerson = EDGE_KIND_LABELS[b.roleKind] ?? "held a position at";
    return {
      id: `board:${b.id}`,
      relation: side === "person" ? asPerson : "recorded a position held by",
      otherLabel: o.label,
      otherHref: o.href,
      detail: [b.role, b.endOn ? `until ${b.endOn.slice(0, 10)}` : null]
        .filter(Boolean)
        .join(", ") || null,
      evidenceStatus: b.evidenceStatus,
      when: when(b.startOn),
    };
  });
}

export type RelRowish = {
  id: string;
  kind: string;
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  startOn: string | null;
  endOn: string | null;
  detail: string | null;
  evidenceStatus: string;
};

export function relationshipEntries<T extends RelRowish>(
  rows: T[],
  selfKey: string,
  other: (type: string, id: string) => { label: string; href: string | null },
): SequenceEntry[] {
  return rows.map((r) => {
    const outbound = `${r.fromType}:${r.fromId}` === selfKey;
    const o = outbound ? other(r.toType, r.toId) : other(r.fromType, r.fromId);
    const verb = EDGE_KIND_LABELS[r.kind] ?? r.kind.replace(/_/g, " ");
    return {
      id: `rel:${r.id}`,
      // An inbound edge is not the same statement as an outbound one, and
      // reusing the verb would reverse who did what.
      relation: outbound ? verb : `is recorded on the other side of "${verb}" with`,
      otherLabel: o.label,
      otherHref: o.href,
      detail: [r.detail, r.endOn ? `until ${r.endOn.slice(0, 10)}` : null]
        .filter(Boolean)
        .join(", ") || null,
      evidenceStatus: r.evidenceStatus,
      when: when(r.startOn),
    };
  });
}
