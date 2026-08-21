import { headers } from "next/headers";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { type RateLimited } from "@/lib/rate-limit-shared";

export { RATE_LIMIT_MESSAGE, type RateLimited } from "@/lib/rate-limit-shared";

/**
 * Fixed-window rate limiting, with the counters in Postgres.
 *
 * Why Postgres: this deploys serverless, so per-instance memory neither
 * survives a cold start nor aggregates across instances, and the platform's
 * per-route rate rules are a paid tier. The counters live where the state
 * already lives, in one UNLOGGED table (no WAL cost; counters that vanish on
 * crash recovery are counters, not records). One upsert per guarded call, and
 * every guarded call is more expensive than the upsert, which is the whole
 * economics of the thing.
 *
 * Key choice: the signed-in user's id where there is one, else the caller's
 * IP. Rotating IPs is cheap; rotating Google accounts is not, so authed
 * surfaces bind to the account.
 *
 * FAIL-OPEN, loudly. If the database is down, the query the limiter guards is
 * down too; a limiter that converts a DB blip into a lockout has inverted its
 * own purpose. The error is logged so a quiet failure cannot become policy.
 *
 * A warm instance also keeps a small in-memory pre-filter so a tight loop
 * hammering one lambda gets refused without a round trip. It is a bonus, not
 * the mechanism: the database window is the one that holds across instances.
 */

export type LimitName = "graph" | "propose" | "report" | "search";

/** Per-surface windows. The shape is {calls, per seconds}; a surface may have
 *  more than one window and must pass all of them. */
const LIMITS: Record<LimitName, Array<{ calls: number; seconds: number }>> = {
  // Read-only graph compute: path finding, expansion, entity search.
  graph: [{ calls: 30, seconds: 60 }],
  // Contribution spam is an attack on the review queue itself: flooding
  // moderators is cheaper than breaking authz, so the day window matters
  // more than the hour one.
  propose: [
    { calls: 6, seconds: 3600 },
    { calls: 20, seconds: 86400 },
  ],
  report: [{ calls: 3, seconds: 3600 }],
  search: [{ calls: 30, seconds: 60 }],
};

export type LimitVerdict =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/** Null when the call may proceed; the refusal object when it may not. */
export async function guardLimit(name: LimitName): Promise<RateLimited | null> {
  const verdict = await rateLimit(name);
  if (verdict.ok) return null;
  return { rateLimited: true, retryAfterSeconds: verdict.retryAfterSeconds };
}

const memory = new Map<string, { windowStart: number; hits: number }>();
const MEMORY_CAP = 2000;

async function callerKey(): Promise<string> {
  const user = await getSessionUser().catch(() => null);
  if (user) return `u:${user.id}`;
  const h = await headers();
  // First hop of x-forwarded-for is the client as Vercel saw it; the rest of
  // the chain is appendable by the client and never trusted.
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${fwd || h.get("x-real-ip") || "unknown"}`;
}

/**
 * Count this call against `name`'s windows. Returns the verdict; the caller
 * turns a refusal into its own error shape.
 */
export async function rateLimit(name: LimitName): Promise<LimitVerdict> {
  const key = await callerKey();

  for (const { calls, seconds } of LIMITS[name]) {
    const now = Date.now();
    const windowStart = Math.floor(now / 1000 / seconds) * seconds;
    const memKey = `${name}:${key}:${seconds}`;

    // Warm-instance pre-filter. Refusal here is always correct (the DB count
    // is >= the local count for this instance); passing here proves nothing,
    // which is why the DB is still asked.
    const local = memory.get(memKey);
    if (local && local.windowStart === windowStart && local.hits >= calls) {
      return { ok: false, retryAfterSeconds: windowStart + seconds - Math.floor(now / 1000) };
    }

    let hits: number;
    try {
      const res = await db.execute(sql`
        INSERT INTO rate_limits (bucket, key, window_start, hits)
        VALUES (${`${name}:${seconds}`}, ${key}, to_timestamp(${windowStart}), 1)
        ON CONFLICT (bucket, key, window_start)
        DO UPDATE SET hits = rate_limits.hits + 1
        RETURNING hits
      `);
      hits = Number((res.rows[0] as { hits: number }).hits);
    } catch (err) {
      console.error("[rate-limit] counter unavailable, failing open:", err);
      return { ok: true };
    }

    if (memory.size > MEMORY_CAP) memory.clear();
    memory.set(memKey, { windowStart, hits });

    if (hits > calls) {
      return { ok: false, retryAfterSeconds: windowStart + seconds - Math.floor(now / 1000) };
    }
  }

  return { ok: true };
}

/**
 * Opportunistic cleanup: rows whose window ended over a day ago carry no
 * information. Called from the loaders that already run at build time rather
 * than from request paths, so no visitor pays for housekeeping.
 */
export async function pruneRateLimits(): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
  } catch {
    // Housekeeping never throws at a caller.
  }
}
