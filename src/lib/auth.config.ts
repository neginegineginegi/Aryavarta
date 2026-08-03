import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export type Role = "contributor" | "moderator" | "admin";

/**
 * Edge-safe Auth.js config: no database adapter, no pg import. The middleware
 * builds its own NextAuth instance from this to decode the session JWT; the
 * full server config in lib/auth.ts spreads this and adds the adapter,
 * providers that need the database, and events.
 */
export const authConfig = {
  providers: [Google],
  // The app always runs behind a trusted host (Vercel / local dev server);
  // required for Auth.js v5 outside of its auto-detected platforms.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on sign-in; persist id + role into the token.
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: Role }).role ?? "contributor";
        // The ADMIN_EMAIL promotion runs in the signIn event AFTER this token
        // is minted; reflect it here too so the first sign-in is already admin.
        const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        if (adminEmail && user.email?.toLowerCase() === adminEmail) {
          token.role = "admin";
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = (token.role as Role) ?? "contributor";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
