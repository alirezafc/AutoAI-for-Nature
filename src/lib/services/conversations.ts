import { eq, desc } from "drizzle-orm";
import { conversations, messages } from "@/db/schema";
import { getDb } from "@/db/client";

export interface ConversationSource {
  title: string;
  id: string;
  type: string;
}

export async function createConversation(language: "en" | "fa") {
  const c = await getDb();
  const [convo] = await c.db.insert(conversations).values({ language }).returning();
  return convo;
}

export async function addMessage(
  conversationId: string,
  data: {
    role: "user" | "assistant";
    content: string;
    sources?: ConversationSource[];
    provider?: string;
    model?: string;
    latencyMs?: number;
    tokensIn?: number;
    tokensOut?: number;
  }
) {
  const c = await getDb();
  const [msg] = await c.db
    .insert(messages)
    .values({
      conversationId,
      role: data.role,
      content: data.content,
      sources: data.sources ?? [],
      provider: data.provider,
      model: data.model,
      latency: data.latencyMs,
      tokensIn: data.tokensIn,
      tokensOut: data.tokensOut,
    })
    .returning();
  return msg;
}

export async function listConversations(limit = 50) {
  const c = await getDb();
  const convos = await c.db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt))
    .limit(limit);
  const msgRows = await c.db
    .select()
    .from(messages)
    .orderBy(messages.createdAt);
  const byConvo = new Map<string, (typeof msgRows)[number][]>();
  for (const m of msgRows) {
    const list = byConvo.get(m.conversationId) ?? [];
    list.push(m);
    byConvo.set(m.conversationId, list);
  }
  return convos.map((conv) => ({ ...conv, messages: byConvo.get(conv.id) ?? [] }));
}

export async function getConversationWithMessages(id: string) {
  const c = await getDb();
  const conv = await c.db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv[0]) return null;
  const msgs = await c.db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  return { ...conv[0], messages: msgs };
}

export async function deleteConversation(id: string): Promise<void> {
  const c = await getDb();
  await c.db.delete(conversations).where(eq(conversations.id, id));
}

/**
 * Persisted counter of ACTUAL RAG retrieval executions (chatbot questions that
 * really went through vector retrieval, including attempts that ended without
 * a relevant hit). Stored in system_settings so no schema change is required;
 * incremented atomically right after a retrieval runs and never for requests
 * that skip retrieval.
 */
export const RAG_QUERY_METRIC_KEY = "metrics.rag.queries";

export async function incrementRagQueryMetric(): Promise<void> {
  const { raw } = await import("@/db/client");
  await raw(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, '1'::jsonb, now())
     ON CONFLICT (key) DO UPDATE
       SET value = to_jsonb((system_settings.value #>> '{}')::int + 1),
           updated_at = now()`,
    [RAG_QUERY_METRIC_KEY]
  );
}

export async function countRagQueries(): Promise<number> {
  try {
    const { raw } = await import("@/db/client");
    const rows = await raw<{ value: unknown }>(
      `SELECT value FROM system_settings WHERE key = $1`,
      [RAG_QUERY_METRIC_KEY]
    );
    return Number(rows[0]?.value ?? 0) || 0;
  } catch {
    return 0;
  }
}
