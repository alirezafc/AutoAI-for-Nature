import { routerChat, type RouterChatOptions } from "@/lib/ai/router";
import { buildRagContext } from "@/lib/rag";
import { assertRealProviderReady } from "@/lib/ai/production-guard";
import { getSetting } from "./system-settings";
import { modelConfigStore } from "./model-config";
import {
  createConversation,
  addMessage,
  getConversationWithMessages,
} from "./conversations";
import { logger } from "@/lib/logging";

export interface ChatReplyResult {
  conversationId: string;
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  sources: { id: string; title: string; type: string; score?: number }[];
  hasRelevant: boolean;
  fallbackUsed: boolean;
}

function detectQuestionLanguage(question: string): "en" | "fa" {
  const faChars = (question.match(/[\u0600-\u06FF\u0750-\u077F]/g) ?? []).length;
  const total = question.replace(/\s/g, "").length || 1;
  return faChars / total > 0.35 ? "fa" : "en";
}

export async function getChatReply(opts: {
  conversationId?: string;
  question: string;
  language: "en" | "fa";
  onChunk?: (chunk: string) => void;
}): Promise<ChatReplyResult> {
  // No real provider (chat + embedding) -> refuse instead of answering with
  // mock content and fabricated sources.
  await assertRealProviderReady(["chatbot", "embedding"], modelConfigStore);
  const language = opts.language === "fa" ? "fa" : "en";
  const questionLang = detectQuestionLanguage(opts.question);
  const replyLanguage = questionLang === "fa" ? "fa" : language;
  let conversationId = opts.conversationId;
  if (!conversationId) {
    const convo = await createConversation(replyLanguage);
    conversationId = convo.id;
  }

  await addMessage(conversationId, { role: "user", content: opts.question });

  const rag = await buildRagContext(opts.question, replyLanguage);
  const ragEmbedding = await getSetting("rag.embedding");

  const history = await getConversationWithMessages(conversationId);
  const recent = (history?.messages ?? [])
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const systemPrompt =
    replyLanguage === "fa"
      ? "تو یک دستیار هوشمند برای وبسایت AutoAI for Nature هستی. فقط به فارسی پاسخ بده. اگر متن منبعی در دسترس است، به آن استناد کن و اگر سوال خارج از محتوای پایگاه است، مودبانه بگو که پاسخی نداری."
      : "You are the intelligent assistant for AutoAI for Nature, an AI-native nature content platform. Answer only in English. Ground your answers in the provided knowledge sources when available. If the question is outside your knowledge base, say so politely and never fabricate citations.";

  const messages: RouterChatOptions["messages"] = [
    { role: "system", content: systemPrompt },
    ...(rag.context
      ? [
          {
            role: "system" as const,
            content:
              replyLanguage === "fa"
                ? `منابع دانش مرتبط (فقط از اینها استفاده کن):\n\n${rag.context}`
                : `Relevant knowledge sources (use these to ground your answer):\n\n${rag.context}`,
          },
        ]
      : []),
    ...recent,
  ];

  let text = "";
  const stream = Boolean(opts.onChunk);

  const result = await routerChat({
    purpose: "chatbot",
    messages,
    runId: `chat-${conversationId}`,
    stream,
    onChunk: opts.onChunk,
    temperature: 50,
    maxTokens: 1024,
    store: modelConfigStore,
  });

  text = result.value.text;

  await addMessage(conversationId, {
    role: "assistant",
    content: text,
    sources: rag.sources,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });

  await cacherUpdateConversationProvider(conversationId, result);

  logger.info(`chat reply from ${result.provider}/${result.model}`, {
    conversationId,
    sources: rag.sources.length,
    fallbackUsed: result.fallbackUsed,
  });

  return {
    conversationId,
    text,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    sources: rag.sources,
    hasRelevant: rag.hasRelevant,
    fallbackUsed: result.fallbackUsed,
  };
}

async function cacherUpdateConversationProvider(
  conversationId: string,
  result: { provider: string; model: string; latencyMs: number }
): Promise<void> {
  try {
    const { conversations } = await import("@/db/schema");
    const { getDb } = await import("@/db/client");
    const { eq } = await import("drizzle-orm");
    const c = await getDb();
    await c.db
      .update(conversations)
      .set({ provider: result.provider, model: result.model, latency: result.latencyMs })
      .where(eq(conversations.id, conversationId));
  } catch (err) {
    logger.warn("failed to update conversation provider", { error: String(err) });
  }
}
