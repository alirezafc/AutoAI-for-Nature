import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import path from "node:path";

type PgliteDb = ReturnType<typeof drizzlePglite<typeof schema>>;

export type DbClient =
  | { mode: "pglite"; instance: PGlite; db: PgliteDb }
  | { mode: "postgres"; instance: Pool; db: NodePgDatabase<typeof schema> };

// IMPORTANT: Next.js dev bundles can duplicate server modules per route group,
// so a module-scope cache would create MULTIPLE independent PGlite instances
// (each with its own in-memory state) — reads would go stale while writes land
// in another instance. The DB must be a single PROCESS-WIDE singleton.
const globalStore = globalThis as { __autoaiDbClient?: DbClient };

export async function getDb(): Promise<DbClient> {
  if (globalStore.__autoaiDbClient) return globalStore.__autoaiDbClient;
  let client: DbClient;
  if (process.env.DATABASE_URL) {
    const { db, pool } = await initPostgres();
    client = { mode: "postgres", instance: pool, db };
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Production requires a PostgreSQL database. Set DATABASE_URL (PostgreSQL connection string with pgvector) and run `npm run db:migrate`. PGlite is local-development only."
      );
    }
    const { db, instance } = await initPglite();
    client = { mode: "pglite", instance, db };
  }
  globalStore.__autoaiDbClient = client;
  return client;
}

function demoDataDir(): string | undefined {
  const dir = path.join(process.cwd(), ".pglite");
  try {
    const fs = require("node:fs");
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.probe-${Date.now()}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return dir;
  } catch {
    return undefined; // read-only FS (e.g. serverless) -> in-memory
  }
}

async function initPglite(): Promise<{ db: PgliteDb; instance: PGlite }> {
  const instance = new PGlite({
    dataDir: demoDataDir(),
    extensions: { vector },
  });
  await instance.waitReady;
  await instance.exec("CREATE EXTENSION IF NOT EXISTS vector");
  const db = drizzlePglite(instance, { schema });
  return { db, instance };
}

async function initPostgres(): Promise<{ db: NodePgDatabase<typeof schema>; pool: Pool }> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const db = drizzlePg(pool, { schema });
  return { db, pool };
}

export async function getDbMode(): Promise<"pglite" | "postgres"> {
  const c = await getDb();
  return c.mode;
}

/**
 * Raw parameterized SQL against whichever database adapter is active.
 * Rows are plain objects. Supports pgvector operators via explicit casts.
 */
export async function raw<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const c = await getDb();
  if (c.mode === "postgres") {
    const res = await c.instance.query(sql, params);
    return res.rows as T[];
  }
  const res = await c.instance.query(sql, params);
  return res.rows as T[];
}

/** Single-row helper. */
export async function rawOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await raw<T>(sql, params);
  return rows[0];
}

export { schema };
