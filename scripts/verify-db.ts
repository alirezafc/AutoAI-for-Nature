import { loadEnv } from "./env";
loadEnv();
import { getDb, raw } from "../src/db/client";

async function main() {
  const c = await getDb();
  const tables = await raw<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  console.log("tables:", tables.map((t) => t.tablename).join(", "));
  const mig = await raw<{ count: number }>(
    "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"
  );
  console.log("applied migrations:", mig[0].count);
  const ext = await raw<{ extname: string }>("SELECT extname FROM pg_extension");
  console.log("extensions:", ext.map((e) => e.extname).join(", "));
  const col = await raw<{ data_type: string }>(
    "SELECT data_type FROM information_schema.columns WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'"
  );
  console.log("embedding column type:", col[0]?.data_type);
  if (c.mode === "postgres") await c.instance.end();
  else await c.instance.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
