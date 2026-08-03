"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { withdrawRevision } from "@/actions/propose";

export function WithdrawButton({ revisionId }: { revisionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await withdrawRevision(revisionId);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
        className="text-[0.78rem] text-danger underline-offset-2 hover:underline disabled:opacity-50"
      >
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
      {error ? <span className="ml-2 text-[0.75rem] text-danger">{error}</span> : null}
    </span>
  );
}
