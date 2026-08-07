"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { adminRemoveEntryAction } from "@/actions/admin-remove";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type { EntityType } from "@/lib/revisions/payloads";

// One session fetch per page load, shared by every button instance (a state
// page can render dozens of rows). Public pages stay static: the session is
// only ever read client-side, after paint.
let rolePromise: Promise<string | null> | null = null;
function fetchRole(): Promise<string | null> {
  rolePromise ??= fetch("/api/auth/session")
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => s?.user?.role ?? null)
    .catch(() => null);
  return rolePromise;
}

/**
 * Admin-only inline "remove" control. Renders nothing for everyone else
 * (the server action re-checks the role regardless). Removal publishes a
 * delete revision immediately; the entry keeps its tombstone and history.
 */
export function AdminRemoveButton({
  entityType,
  entityId,
  label,
}: {
  entityType: EntityType;
  entityId: string;
  label: string;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;
    fetchRole().then((role) => {
      if (mounted) setIsAdmin(role === "admin");
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!isAdmin) return null;

  return (
    <form
      action={adminRemoveEntryAction}
      className="inline-block"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Remove "${label}" from the live record?\n\nThis publishes an admin removal immediately. The entry keeps a public tombstone and full history.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="next" value={pathname} />
      <SubmitButton
        pendingLabel="removing…"
        className="font-mono text-[0.66rem] text-danger underline-offset-2 opacity-70 hover:opacity-100 hover:underline"
      >
        remove
      </SubmitButton>
    </form>
  );
}
