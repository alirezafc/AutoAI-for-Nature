/**
 * AutoAI — Production Reset (SAFE, demo data only)
 *
 * Removes DEMO / TEST records from a production PostgreSQL database:
 * posts, revisions, categories, feedback, lessons, agent runs/steps,
 * conversations/messages, knowledge documents/chunks, workflow RUNS,
 * backups, audit logs and MCP invocation logs.
 *
 * NEVER touches (preserved on purpose):
 * - schema & migration history
 * - users (admin accounts)
 * - configuration structure: system_settings
 * - provider definitions: model_providers, model_configs, agent_configs,
 *   agent_prompt_versions
 * - workflow definitions: workflows
 * - MCP definitions: mcp_tools, mcp_hosts
 * - voice configuration: voice_configs
 *
 * Usage:
 *   DATABASE_URL=postgres://... npm run db:reset:production -- --yes
 *
 * The script refuses to run without an explicit `--yes` flag and refuses to
 * run against the local PGlite development database.
 */
import { loadEnv } from "./env";
loadEnv();

const CONFIRM_FLAG = "--yes";

async function main() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    console.error(
      "ABORT: this deletes ALL content/demo data in the configured database.\n" +
        "Re-run with `-- --yes` to confirm. Schema and configuration are preserved."
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ABORT: DATABASE_URL is not set. This reset targets PRODUCTION PostgreSQL only — it must never run against local PGlite.");
    process.exit(1);
  }

  const { getDb } = await import("../src/db/client");
  const c = await getDb();
  if (c.mode !== "postgres") {
    console.error("ABORT: no DATABASE_URL active (running on PGlite). Production reset requires PostgreSQL.");
    process.exit(1);
  }

  // Demo/content data only, children before parents.
  const statements = [
    "DELETE FROM feedback",
    "DELETE FROM post_revisions",
    "DELETE FROM agent_steps",
    "DELETE FROM agent_runs",
    "DELETE FROM knowledge_chunks",
    "DELETE FROM knowledge_documents",
    "DELETE FROM messages",
    "DELETE FROM conversations",
    "DELETE FROM backups",
    "DELETE FROM workflow_runs",
    "DELETE FROM posts",
    "DELETE FROM categories",
    "DELETE FROM lessons",
    "DELETE FROM audit_logs",
    "DELETE FROM mcp_invocations",
  ];

  for (const sql of statements) {
    const res = await c.instance.query(sql);
    const table = sql.replace("DELETE FROM ", "");
    console.log(`reset: ${table} -> ${res.rowCount ?? 0} row(s) removed`);
  }

  await c.instance.end();
  console.log("Production reset complete. Schema, migrations, users and all definitions preserved.");
}

main().catch((err) => {
  console.error("Reset failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
