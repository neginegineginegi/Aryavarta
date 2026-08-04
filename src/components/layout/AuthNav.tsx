"use client";

import Link from "next/link";
import { SessionProvider, signOut, useSession } from "next-auth/react";

function UserIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="5.2" r="2.7" />
      <path d="M2.8 13.6c0.9-2.4 2.8-3.6 5.2-3.6s4.3 1.2 5.2 3.6" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h5.5" strokeLinecap="round" />
      <path d="M7 8h6.5M11 5.2 13.8 8 11 10.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Client-side session widget. Public pages stay static because the session
 * is fetched from /api/auth/session after paint, never during SSR.
 *
 * Signed in, this renders as a quiet account cluster (set apart from the
 * primary nav by a hairline divider), not as more navigation links.
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
        className="rounded-sm border border-rule-dark px-3 py-1 font-mono text-[0.72rem] text-ink transition-colors hover:border-ink"
      >
        Sign in
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-x-5 border-l border-rule pl-6 font-mono text-[0.72rem]">
      {(user.role === "moderator" || user.role === "admin") && (
        <Link href="/review" className="text-accent underline-offset-2 hover:underline">
          Review
        </Link>
      )}
      <Link
        href={`/user/${user.id}`}
        className="flex items-center gap-1.5 text-ink-muted transition-colors hover:text-ink"
        title={user.name ?? user.email ?? "Account"}
      >
        <UserIcon />
        <span className="max-w-32 truncate">{user.name ?? user.email}</span>
      </Link>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="flex items-center gap-1.5 text-ink-faint transition-colors hover:text-ink"
      >
        <SignOutIcon />
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
