"use client";

import Link from "next/link";
import { SessionProvider, signOut, useSession } from "next-auth/react";

/**
 * Client-side session widget. Public pages stay static because the session
 * is fetched from /api/auth/session after paint, never during SSR.
 */
function AuthNavInner() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="inline-block w-16" aria-hidden />;
  }

  const user = session?.user;
  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-sm border border-rule-dark px-3 py-1 text-ink transition-colors hover:border-ink"
      >
        Sign in
      </Link>
    );
  }

  return (
    <span className="inline-flex items-center gap-3">
      <Link
        href={`/user/${user.id}`}
        className="max-w-32 truncate text-ink underline-offset-2 hover:underline"
        title={user.name ?? user.email ?? "Account"}
      >
        {user.name ?? user.email}
      </Link>
      {(user.role === "moderator" || user.role === "admin") && (
        <Link href="/review" className="text-accent underline-offset-2 hover:underline">
          Review
        </Link>
      )}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-ink-muted transition-colors hover:text-ink"
      >
        Sign out
      </button>
    </span>
  );
}

export function AuthNav() {
  return (
    <SessionProvider>
      <AuthNavInner />
    </SessionProvider>
  );
}
