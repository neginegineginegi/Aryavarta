import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

/**
 * UX-only gate: bounce anonymous visitors off member pages and non-moderators
 * off review/admin pages. The real security boundary is requireRole() inside
 * every server action and privileged page — never this middleware.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  if (!user) {
    const login = new URL("/login", req.nextUrl);
    login.searchParams.set("next", pathname);
    return Response.redirect(login);
  }

  const role = user.role ?? "contributor";
  if (pathname.startsWith("/review") && role !== "moderator" && role !== "admin") {
    return Response.redirect(new URL("/", req.nextUrl));
  }
  if (pathname.startsWith("/admin") && role !== "admin") {
    return Response.redirect(new URL("/", req.nextUrl));
  }
});

export const config = {
  matcher: ["/contribute/:path*", "/review/:path*", "/admin/:path*"],
};
