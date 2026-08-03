import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq, ne } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/lib/db";
import { accounts, users, verificationTokens } from "@/lib/db/schema";
import { authConfig, type Role } from "@/lib/auth.config";

/**
 * Dev-only sign-in, for local development without Google OAuth credentials.
 * Deliberately gated behind an explicit, ugly opt-in value so it cannot be
 * enabled by accident in production. Never set this on a deployed site.
 */
const DEV_LOGIN_ENABLED = process.env.AUTH_DEV_LOGIN === "insecure-dev-mode";

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
     */
    async signIn({ user }) {
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
