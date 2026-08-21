/**
 * The pieces of rate limiting both sides need.
 *
 * Split from rate-limit.ts because that module imports next/headers and the
 * database, which a client component must not pull into its bundle. This file
 * has no imports at all.
 */

/**
 * The in-band refusal a read-only action returns instead of its result.
 *
 * In-band rather than thrown, for two reasons. Next masks thrown action
 * errors in production, so the client could not tell a refusal from a bug.
 * And an empty result in this app is a STATEMENT — "no documented paths
 * exist" — so a limiter that returned [] would put words in the archive's
 * mouth. A refusal has to look like a refusal.
 */
export type RateLimited = { rateLimited: true; retryAfterSeconds: number };

/** The sentence shown when a call is refused. One voice everywhere. */
export const RATE_LIMIT_MESSAGE =
  "Too many requests in a short time. Wait a minute and try again.";
