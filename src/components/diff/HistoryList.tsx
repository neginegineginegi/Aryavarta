import Link from "next/link";

import { Badge } from "@/components/ui/Badge";

const REVISION_BADGE = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "neutral",
} as const;

type HistoryRow = {
  id: string;
  title: string;
  action: string;
  entityType: string;
  status: keyof typeof REVISION_BADGE;
  origin?: "community" | "import";
  summary: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  proposer: { id: string; name: string | null } | null;
  reviewer: { id: string; name: string | null } | null;
};

/** Wikipedia-style revision log: every proposal, decided or not. */
export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-3 text-[0.85rem] text-ink-muted">No revisions recorded yet.</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-rule">
      {rows.map((rev) => (
        <li key={rev.id} className="py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Badge variant={REVISION_BADGE[rev.status]}>{rev.status}</Badge>
            {rev.origin === "import" && <Badge variant="import">imported</Badge>}
            <Link
              href={`/revision/${rev.id}`}
              className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
            >
              {rev.title}
            </Link>
            <span className="text-[0.78rem] text-ink-faint">
              {rev.entityType} {rev.action} · {rev.createdAt.toISOString().slice(0, 10)}
            </span>
          </div>
          <p className="mt-0.5 text-[0.82rem] text-ink-muted">
            {rev.proposer ? (
              <Link href={`/user/${rev.proposer.id}`} className="text-accent hover:underline">
                {rev.proposer.name ?? "unnamed"}
              </Link>
            ) : (
              "unknown"
            )}
            : “{rev.summary}”
            {rev.status !== "pending" && rev.reviewer ? (
              <span className="text-ink-faint">
                {" · "}{rev.status} by{" "}
                <Link href={`/user/${rev.reviewer.id}`} className="text-accent hover:underline">
                  {rev.reviewer.name ?? "moderator"}
                </Link>
                {rev.reviewNote ? <> (“{rev.reviewNote}”)</> : null}
              </span>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
