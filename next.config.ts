import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Served from here rather than the middleware, because the middleware matcher
 * covers three path groups and widening it would add an invocation to every
 * request; headers() reaches static and ISR routes for free.
 *
 * The CSP is ENFORCED. It ran Report-Only first, and the measurement across
 * seven pages found exactly one violation class: script-src-elem <- inline,
 * Next's own bootstrap scripts. That evidence is why script-src carries
 * 'unsafe-inline' and nothing else was loosened.
 *
 * THE CONCESSION, on the record: 'unsafe-inline' in script-src means an
 * attacker who can get markup into a page could run script. It is accepted
 * because this codebase gives them no way to get markup in: zero
 * dangerouslySetInnerHTML, zero third-party scripts, no remote assets, and
 * React escaping everything interpolated. What would remove it: a nonce-based
 * policy ('nonce-…' + 'strict-dynamic') via the Proxy file — deliberately
 * deferred, because Next requires dynamic rendering on every page that
 * carries a nonce, and the homepage, /insights, /union and the state pages
 * are deliberately static or ISR. Revisit if the app ever grows an injection
 * surface or gives up ISR.
 *
 * In development only, 'unsafe-eval' joins script-src: React uses eval for
 * server-error stack reconstruction there; production does not need it.
 *
 * style-src carries 'unsafe-inline' permanently: React style={{...}}
 * attributes (23 files) and the canvas engines writing el.style per frame are
 * inline styles, and blocking them is all cost and no security.
 *
 * report-uri stays after enforcement, so anything the local measurement did
 * not cover (the Google OAuth form redirect, an exotic browser) shows up in
 * /api/csp-report via `vercel logs` instead of failing silently.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
].join("; ");

const SECURITY_HEADERS = [
  // Enforced now: none of these can break a page that is not already broken.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Belt (old browsers) and braces (frame-ancestors, in the CSP).
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  // The curated party-color sheet is read at runtime when imports create
  // parties (src/lib/import/canonical-party-colors.ts); trace it into every
  // server bundle so serverless deploys can find it.
  outputFileTracingIncludes: {
    "/*": ["data/inbox/party_colors.csv"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
