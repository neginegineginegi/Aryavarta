import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq, ne } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/lib/db";
import { accounts, users, verificationTokens } from "@/lib/db/schema";
import { authConfig, type Role } from "@/lib/auth.config";

/**
 * Dev-only sign-in, for local development without Google OAuth credentials.
 *
 * This provider authorizes ANY string containing an "@" with no credential of
 * any kind, and creates the account if it does not exist, stamped
 * emailVerified. On its own that is impersonation. Combined with the admin
 * bootstrap below, which promotes ADMIN_EMAIL on every sign-in, it is
 * privilege escalation: type the administrator's address into the form and
 * arrive as an administrator.
 *
 * So the opt-in value is not the only lock, because "never set this in
 * production" is a rule that survives exactly as long as everyone remembers
 * it. Three locks, and all three must fail together:
 *
 *   1. the explicit ugly value below,
 *   2. NODE_ENV, which Next sets to production for every production build,
 *   3. VERCEL_ENV, so a preview deployment cannot enable it either.
 *
 * A fourth sits in scripts/check-auth-dev-login.mjs, which fails the
 * production build outright if the variable is set at all, and a fifth in the
 * signIn event, which refuses to promote anyone who did not arrive by Google.
 */
const DEPLOYED = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
const DEV_LOGIN_ENABLED =
  process.env.AUTH_DEV_LOGIN === "insecure-dev-mode" &&
  process.env.NODE_ENV !== "production" &&
  !DEPLOYED;

const devLoginProvider = Credentials({
  id: "dev-login",
  name: "Development sign-in",
  credentials: { email: { label: "Email" } },
  async authorize(credentials) {
    if (!DEV_LOGIN_ENABLED) return null;
    const email = String(credentials?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return null;
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) return existing;
    const [created] = await db
      .insert(users)
      .values({ email, name: email.split("@")[0], emailVerified: new Date() })
      .returning();
    return created;
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  providers: [...authConfig.providers, ...(DEV_LOGIN_ENABLED ? [devLoginProvider] : [])],
  events: {
    /**
     * Admin bootstrap: the account whose email matches ADMIN_EMAIL is
     * promoted on every sign-in. Idempotent, and works even if the user
     * signed up before ADMIN_EMAIL was configured.
     *
     * Google only. Promotion is the highest-value action in this system, and
     * it should rest on an identity somebody else verified rather than on
     * whatever provider happened to hand us an email. The dev provider cannot
     * run in production at all, and if that ever stopped being true this
     * clause is what keeps the failure to impersonation rather than escalation.
     */
    async signIn({ user, account }) {
      if (account?.provider !== "google") return;
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (!adminEmail || !user.email || user.email.toLowerCase() !== adminEmail) return;
      await db
        .update(users)
        .set({ role: "admin" })
        .where(and(eq(users.email, user.email), ne(users.role, "admin")));
    },
  },
});

export type { Role };
