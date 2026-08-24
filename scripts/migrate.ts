import path from "node:path";
import { loadEnv } from "./env";
loadEnv();

import { getDb } from "../src/db/client";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import { EMBEDDING_DIMENSIONS } from "../src/db/schema/common";

async function main() {
  const folder = path.join(process.cwd(), "drizzle");
  const c = await getDb();
  if (c.mode === "pglite") {
    await migratePglite(c.db, { migrationsFolder: folder });
  } else {
    // Production: the managed database must provide the pgvector extension.
    // Enabled explicitly here so a fresh managed PostgreSQL needs no manual
    // initialization step beyond DATABASE_URL + this command.
    await c.instance.query("CREATE EXTENSION IF NOT EXISTS vector");
    await migratePostgres(c.db, { migrationsFolder: folder });

    // Embedding contract check: fail loudly if the deployed schema does not
    // match the canonical embedding dimensions.
    const col = await c.instance.query(
      `SELECT atttypmod AS dim FROM pg_attribute
       WHERE attrelid = 'knowledge_chunks'::regclass AND attname = 'embedding'`
    );
    const dim = Number((col.rows[0] as { dim?: number } | undefined)?.dim ?? 0);
    if (dim !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding contract violation: knowledge_chunks.embedding is vector(${dim}) but the application requires vector(${EMBEDDING_DIMENSIONS}). Run migrations against this database.`
      );
    }
    await c.instance.end();
  }
  console.log(`AutoAI: schema ready (database mode: ${c.mode}, embeddings: ${EMBEDDING_DIMENSIONS}d).`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
