import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";

import * as schema from "./schema";

// The approval flow needs interactive transactions (SELECT ... FOR UPDATE with
// conditional logic mid-transaction), which the neon-http driver cannot do —
// so prod uses Neon's WebSocket driver and local dev uses node-postgres.
// Both are selected via DATABASE_DRIVER ('neon' | anything else = pg).
//
// Pools are cached on globalThis so dev-server HMR and warm serverless
// invocations reuse connections instead of exhausting the database.

type DrizzleDb = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __abhilekhDb?: DrizzleDb };

function createDb(): DrizzleDb {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (process.env.DATABASE_DRIVER === "neon") {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString });
    // Structurally compatible with NodePgDatabase for every query/transaction
    // API we use; a single exported type keeps call sites clean.
    return drizzleNeon(pool, { schema }) as unknown as DrizzleDb;
  }

  const pool = new PgPool({ connectionString });
  return drizzlePg(pool, { schema });
}

export const db: DrizzleDb = globalForDb.__abhilekhDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__abhilekhDb = db;
}

export type Db = DrizzleDb;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
