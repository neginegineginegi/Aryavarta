"use client";

import { bulkApproveImportsAction } from "@/actions/review";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * Admin-only mass approval of imported drafts, 50 per click. Rendered only
 * when the server component has already verified the admin role.
 */
export function BulkApproveButton({
  stateFilter,
  importCount,
}: {
  stateFilter?: string;
  importCount: number;
}) {
  const batch = Math.min(importCount, 50);
  return (
    <form
      action={bulkApproveImportsAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Publish ${batch} imported draft${batch === 1 ? "" : "s"}${stateFilter ? " for this state" : ""} now?\n\nThis approves them exactly like clicking Approve on each row: they go live immediately, recorded as bulk-approved by you. Conflicting or invalid drafts are skipped and stay in the queue.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      {stateFilter ? <input type="hidden" name="state" value={stateFilter} /> : null}
      <SubmitButton
        pendingLabel="Publishing batch…"
        className="rounded-sm bg-approved px-3 py-1.5 font-mono text-[0.72rem] font-bold text-white transition-opacity hover:opacity-85"
      >
        Approve {batch} imported draft{batch === 1 ? "" : "s"}
        {importCount > batch ? ` (${importCount} queued)` : ""}
      </SubmitButton>
    </form>
  );
}
