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

export async function countRagQueries(): Promise<number> {
  const { raw } = await import("@/db/client");
  try {
    const rows = await raw<{ count: number }>(
      `SELECT count(DISTINCT c.id)::int AS count
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id
       WHERE m.role = 'assistant' AND jsonb_array_length(m.sources) > 0`
    );
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}
