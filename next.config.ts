import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Served from here rather than the middleware, because the middleware matcher
 * covers three path groups and widening it would add an invocation to every
 * request; headers() reaches static and ISR routes for free.
 *
 * The CSP ships REPORT-ONLY, and deliberately strict: script-src 'self' with
 * no 'unsafe-inline', which Next's own inline bootstrap scripts will violate.
 * That is the point. The report data shows exactly what fires and nothing
 * else, so the enforcement decision is made on evidence rather than on the
 * docs' word. Violations land in /api/csp-report, which logs them where
 * `vercel logs` can see.
 *
 * Why not a nonce policy: Next's CSP guide is explicit that nonces require
 * dynamic rendering on every page that carries one. The homepage, /insights,
 * /union and the state pages are deliberately static or ISR; a nonce would
 * quietly turn all of them dynamic. The endstate agreed instead: enforce with
 * 'unsafe-inline' in script-src, weighed against a surface with zero
 * dangerouslySetInnerHTML, zero third-party scripts, and no remote assets.
 *
 * style-src carries 'unsafe-inline' from the start: React style={{...}}
 * attributes (23 files) and the canvas engines writing el.style per frame are
 * inline styles, and blocking them is all cost and no security.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self'",
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
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
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
