import { desc, eq } from "drizzle-orm";
import { mcpTools, mcpInvocations } from "@/db/schema";
import { getDb } from "@/db/client";
import { logger } from "@/lib/logging";

const CATALOG: { name: string; description: string }[] = [
  { name: "list_posts", description: "List posts with filters" },
  { name: "get_post", description: "Get a single post" },
  { name: "search_knowledge", description: "Semantic search over RAG knowledge base" },
  { name: "list_agent_runs", description: "List recent AI pipeline runs" },
  { name: "get_agent_run", description: "Get an agent run with all steps" },
  { name: "list_categories", description: "List categories" },
  { name: "get_vector_stats", description: "RAG vector store statistics" },
  { name: "list_backups", description: "List content backups" },
  { name: "list_workflow_runs", description: "List workflow executions" },
  { name: "list_lessons", description: "List lessons applied to future runs" },
  { name: "get_conversation", description: "Get a chat conversation" },
  { name: "list_models", description: "List configured AI models" },
];

export async function ensureMcpTools(): Promise<void> {
  try {
    const c = await getDb();
    for (const tool of CATALOG) {
      await c.db
        .insert(mcpTools)
        .values({ name: tool.name, description: tool.description, readOnly: true })
        .onConflictDoNothing();
    }
  } catch (err) {
    logger.warn(`ensureMcpTools failed`, { error: String(err) });
  }
}

export async function logMcpInvocation(input: {
  tool: string;
  host?: string;
  status?: string;
  durationMs?: number;
  paramsSummary?: string;
  error?: string;
}): Promise<void> {
  try {
    const c = await getDb();
    await c.db.insert(mcpInvocations).values({
      tool: input.tool,
      host: input.host ?? "unknown",
      status: input.status ?? "success",
      durationMs: input.durationMs,
      paramsSummary: input.paramsSummary ?? "",
      error: input.error,
      finishedAt: new Date(),
    });
    const existing = await c.db.select().from(mcpTools).where(eq(mcpTools.name, input.tool)).limit(1);
    if (existing[0]) {
      await c.db
        .update(mcpTools)
        .set({ invocationsCount: (existing[0].invocationsCount ?? 0) + 1 })
        .where(eq(mcpTools.name, input.tool));
    }
  } catch (err) {
    logger.warn(`logMcpInvocation failed`, { error: String(err) });
  }
}

export async function listMcpInvocations(limit = 50) {
  const c = await getDb();
  return c.db.select().from(mcpInvocations).orderBy(desc(mcpInvocations.startedAt)).limit(limit);
}
