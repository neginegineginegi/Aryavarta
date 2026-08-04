import Link from "next/link";

import { Badge } from "@/components/ui/Badge";

const REVISION_BADGE = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "neutral",
} as const;

type UserRef = { id: string; name: string | null } | null;

export function RevisionMeta({
  rev,
}: {
  rev: {
    id: string;
    action: string;
    entityType: string;
    status: keyof typeof REVISION_BADGE;
    origin?: "community" | "import";
    summary: string;
    createdAt: Date;
    reviewedAt: Date | null;
    reviewNote: string | null;
    proposer: UserRef;
    reviewer: UserRef;
    state: { id: string; name: string };
  };
}) {
  return (
    <div className="rounded-sm border border-rule bg-paper-sunken/50 p-4 text-[0.85rem]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Badge variant={REVISION_BADGE[rev.status]}>{rev.status}</Badge>
        {rev.origin === "import" && <Badge variant="import">imported draft</Badge>}
        <span className="text-ink">
          <strong className="capitalize">{rev.action}</strong> · {rev.entityType} ·{" "}
          <Link href={`/state/${rev.state.id}`} className="text-accent hover:underline">
            {rev.state.name}
          </Link>
        </span>
      </div>
      <p className="mt-2 text-ink">
        Proposed by{" "}
        {rev.proposer ? (
          <Link href={`/user/${rev.proposer.id}`} className="text-accent hover:underline">
            {rev.proposer.name ?? "unnamed contributor"}
          </Link>
        ) : (
          <span className="italic">unknown</span>
        )}{" "}
        on{" "}
        <time dateTime={rev.createdAt.toISOString()}>
          {rev.createdAt.toISOString().slice(0, 10)}
        </time>
        {" · "}
        <span className="text-ink-muted">“{rev.summary}”</span>
      </p>
      {rev.status !== "pending" && (
        <p className="mt-1 text-ink-muted">
          {rev.status === "approved" ? "Approved" : rev.status === "rejected" ? "Rejected" : "Withdrawn"}
          {rev.reviewer ? (
            <>
              {" "}by{" "}
              <Link href={`/user/${rev.reviewer.id}`} className="text-accent hover:underline">
                {rev.reviewer.name ?? "moderator"}
              </Link>
            </>
          ) : null}
          {rev.reviewedAt ? <> on {rev.reviewedAt.toISOString().slice(0, 10)}</> : null}
          {rev.reviewNote ? <> — “{rev.reviewNote}”</> : null}
        </p>
      )}
    </div>
  );
}
