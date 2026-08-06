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
        className="rounded-full border border-rule-dark px-4 py-1.5 font-mono text-[0.75rem] leading-none text-ink transition-colors hover:border-ink hover:bg-paper-sunken"
      >
        Sign in
      </Link>
    );
  }

  // Same pill rhythm as the primary nav, one step quieter: Review is the only
  // tinted item because it is the only one that carries pending work.
  const item =
    "flex items-center gap-1.5 rounded-full px-3 py-1.5 leading-none transition-colors";

  return (
    <span className="-mr-3 flex items-center border-l border-rule pl-4 font-mono text-[0.75rem]">
      {(user.role === "moderator" || user.role === "admin") && (
        <Link
          href="/review"
          className={`${item} font-medium text-accent-dark hover:bg-accent-wash`}
        >
          Review
        </Link>
      )}
      <Link
        href={`/user/${user.id}`}
        className={`${item} text-ink-muted hover:bg-paper-sunken hover:text-ink`}
        title={user.name ?? user.email ?? "Account"}
      >
        <UserIcon />
        <span className="max-w-32 truncate">{user.name ?? user.email}</span>
      </Link>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className={`${item} text-ink-faint hover:bg-paper-sunken hover:text-ink`}
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
