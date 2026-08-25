import { routerChat, type RouterChatOptions } from "@/lib/ai/router";
import { buildRagContext } from "@/lib/rag";
import { assertRealProviderReady } from "@/lib/ai/production-guard";
import { getSetting } from "./system-settings";
import { modelConfigStore } from "./model-config";
import {
  createConversation,
  addMessage,
  getConversationWithMessages,
  incrementRagQueryMetric,
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

/** Deterministic knowledge-base refusals — NEVER answered by the LLM. */
export const REFUSAL_EN = "This topic is not available in the AutoAI for Nature knowledge base.";
export const REFUSAL_FA = "این موضوع در پایگاه دانش AutoAI for Nature وجود ندارد.";

function isRefusal(text: string): boolean {
  const t = text.trim();
  return t === REFUSAL_EN || t === REFUSAL_FA;
}

/**
 * Most recent exchange whose answer was genuinely grounded in retrieved
 * sources (refusals carry no sources and never become anchors). Follow-up
 * context may ONLY ride on such an exchange — never on general chat history.
 */
function findLastGroundedAnchor(
  msgs: { role: string; content: string; sources?: { title: string; id: string; type: string }[] | null }[]
): string | null {
  for (let i = msgs.length - 1; i > 0; i--) {
    const m = msgs[i];
    if (m.role !== "assistant") continue;
    if (!m.sources || m.sources.length === 0 || isRefusal(m.content)) continue;
    for (let j = i - 1; j >= 0; j--) {
      if (msgs[j].role === "user") return msgs[j].content;
    }
  }
  return null;
}

const GROUNDING_RULE_EN =
  "STRICT GROUNDING: Answer ONLY with information contained in the provided knowledge sources. " +
  "If the sources do not contain the answer, reply with EXACTLY this sentence and nothing else: " +
  `"${REFUSAL_EN}" Never use general world knowledge. Never fabricate citations.`;
const GROUNDING_RULE_FA =
  "قاعدهٔ سخت‌گیرانهٔ استناد: فقط بر اساس منابع دانش ارائه‌شده پاسخ بده. " +
  `اگر پاسخ در منابع نیست، دقیقاً همین جمله را برگردان و هیچ چیز دیگر ننویس: «${REFUSAL_FA}» ` +
  "از دانش عمومی خود استفاده نکن و منبع جعلی نساز.";

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

  // Previous exchange, used ONLY for follow-up context rescue (never to bypass
  // grounding): context may be reused only when a previous answer was itself
  // grounded in retrieved knowledge sources.
  const prior = await getConversationWithMessages(conversationId);
  const priorMessages = prior?.messages ?? [];
  const previousGroundedQuestion = findLastGroundedAnchor(
    priorMessages.map((m) => ({ role: m.role, content: m.content, sources: m.sources }))
  );

  await addMessage(conversationId, { role: "user", content: opts.question });

  // Actual RAG retrieval #1 for this question.
  const rag = await buildRagContext(opts.question, replyLanguage);
  await incrementRagQueryMetric();

  let effectiveRag = rag;
  if (!effectiveRag.hasRelevant && previousGroundedQuestion) {
    // Follow-up ("و قبلش چی؟"): re-retrieve combining the last GROUNDED topic
    // with the follow-up so short conversational questions stay anchored to
    // real sources. If this retrieval also finds nothing relevant, we refuse.
    effectiveRag = await buildRagContext(`${previousGroundedQuestion}\n${opts.question}`, replyLanguage);
    await incrementRagQueryMetric();
  }

  if (!effectiveRag.hasRelevant) {
    // Hard refusal WITHOUT any model call: no general-world answers possible.
    const refusal = replyLanguage === "fa" ? REFUSAL_FA : REFUSAL_EN;
    await addMessage(conversationId, {
      role: "assistant",
      content: refusal,
      sources: [],
      provider: "none",
      model: "knowledge-grounding-guard",
    });
    logger.info(`chat refused (no relevant knowledge)`, { conversationId });
    return {
      conversationId,
      text: refusal,
      provider: "none",
      model: "knowledge-grounding-guard",
      latencyMs: 0,
      sources: [],
      hasRelevant: false,
      fallbackUsed: false,
    };
  }
  const ragEmbedding = await getSetting("rag.embedding");

  const history = await getConversationWithMessages(conversationId);
  const recent = (history?.messages ?? [])
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const systemPrompt =
    replyLanguage === "fa"
      ? "تو یک دستیار هوشمند برای وبسایت AutoAI for Nature هستی. فقط به فارسی پاسخ بده. به سوالات فقط بر اساس منابع دانش ارائه‌شده پاسخ بده و به آن‌ها استناد کن. " + GROUNDING_RULE_FA
      : "You are the intelligent assistant for AutoAI for Nature, an AI-native nature content platform. Answer only in English. " + GROUNDING_RULE_EN;

  const messages: RouterChatOptions["messages"] = [
    { role: "system", content: systemPrompt },
      {
        role: "system" as const,
        content:
          replyLanguage === "fa"
            ? `منابع دانش مرتبط (فقط از اینها استفاده کن):\n\n${effectiveRag.context}`
            : `Relevant knowledge sources (use these to ground your answer):\n\n${effectiveRag.context}`,
      },
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

  // Grounding normalization: if the model itself reports the knowledge base
  // cannot answer (exact refusal sentence), the exchange must be recorded and
  // returned as an ungrounded refusal — sources cleared, no fake attribution.
  if (isRefusal(text)) {
    const refusal = replyLanguage === "fa" ? REFUSAL_FA : REFUSAL_EN;
    await addMessage(conversationId, {
      role: "assistant",
      content: refusal,
      sources: [],
      provider: "none",
      model: "knowledge-grounding-guard",
    });
    logger.info(`chat refused by grounding rule (llm-confirmed)`, { conversationId });
    return {
      conversationId,
      text: refusal,
      provider: "none",
      model: "knowledge-grounding-guard",
      latencyMs: result.latencyMs,
      sources: [],
      hasRelevant: false,
      fallbackUsed: result.fallbackUsed,
    };
  }

  await addMessage(conversationId, {
    role: "assistant",
    content: text,
    sources: effectiveRag.sources,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });

  await cacherUpdateConversationProvider(conversationId, result);

  logger.info(`chat reply from ${result.provider}/${result.model}`, {
    conversationId,
    sources: effectiveRag.sources.length,
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
    sources: effectiveRag.sources,
    hasRelevant: effectiveRag.hasRelevant,
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
