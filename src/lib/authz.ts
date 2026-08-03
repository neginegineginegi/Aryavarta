import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth, type Role } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const ROLE_RANK: Record<Role, number> = { contributor: 0, moderator: 1, admin: 2 };

export class AuthzError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthzError";
  }
}

export type SessionUser = { id: string; email: string; name: string | null; role: Role };

/** Session user from the JWT, or null. Fine for UI decisions; NOT for authz. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  return { id: u.id, email: u.email, name: u.name ?? null, role: u.role ?? "contributor" };
}

/** For pages: redirect anonymous visitors to /login. */
export async function requireUserPage(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return user;
}

/**
 * The security boundary for mutations and privileged reads. Re-fetches the
 * role from the database — the JWT claim is treated as a hint only, so a
 * demotion takes effect immediately, not at next sign-in.
 */
export async function requireRole(minimum: Role): Promise<SessionUser> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) throw new AuthzError("You must be signed in.");
  const row = await db.query.users.findFirst({ where: eq(users.id, u.id) });
  if (!row) throw new AuthzError("Account not found.");
  if (ROLE_RANK[row.role] < ROLE_RANK[minimum]) {
    throw new AuthzError(`This action requires the ${minimum} role.`);
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
