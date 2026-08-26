import { eq } from "drizzle-orm";
import { voiceConfigs } from "@/db/schema";
import { getDb } from "@/db/client";
import { routerChat } from "@/lib/ai/router";
import { buildRagContext } from "@/lib/rag";
import { modelConfigStore } from "./model-config";
import { logger } from "@/lib/logging";

export interface VoiceConfigInput {
  sttProvider?: string;
  sttModel?: string;
  llmProvider?: string;
  llmModel?: string;
  ttsProvider?: string;
  ttsModel?: string;
  voice?: string;
  temperature?: number;
  speed?: number;
  greeting?: string;
  systemPrompt?: string;
  ragEnabled?: boolean;
  saveConversations?: boolean;
}

export async function getVoiceConfig() {
  const c = await getDb();
  const rows = await c.db.select().from(voiceConfigs).limit(1);
  return rows[0] ?? null;
}

/**
 * V1 Voice Agent reality contract.
 *
 * The ONLY fields the current implementation actually consumes are:
 *   - ragEnabled    (gates RAG retrieval in getVoiceReply)
 *   - systemPrompt  (overrides the built-in spoken-assistant prompt)
 *   - temperature   (passed to routerChat)
 *
 * STT/TTS run entirely in the BROWSER via the Web Speech API (public /voice
 * page) — server-side stt/tts/voice/speed columns and llmProvider/llmModel
 * fields are NOT consumed (the LLM is resolved per-purpose through Admin →
 * Models, purpose "voice"). They must never resurface as fake settings.
 */
export interface VoiceSettings {
  ragEnabled: boolean;
  systemPrompt: string;
  temperature: number;
}

export interface VoiceStatusInfo {
  stt: string;
  tts: string;
  languages: ("en" | "fa")[];
  conversationSaving: boolean;
}

export const VOICE_STATUS: VoiceStatusInfo = {
  stt: "browser-web-speech",
  tts: "browser-web-speech",
  languages: ["en", "fa"],
  conversationSaving: false,
};

export function resolveVoiceSettings(
  config: Partial<Pick<VoiceConfigInput, "ragEnabled" | "systemPrompt" | "temperature">> | null | undefined
): VoiceSettings {
  return {
    ragEnabled: config?.ragEnabled !== false,
    systemPrompt: typeof config?.systemPrompt === "string" ? config.systemPrompt : "",
    temperature:
      typeof config?.temperature === "number" && Number.isFinite(config.temperature)
        ? config.temperature
        : 50,
  };
}

export async function setVoiceConfig(input: VoiceConfigInput) {
  const c = await getDb();
  const existing = await getVoiceConfig();
  const values: Record<string, unknown> = {
    sttProvider: input.sttProvider,
    sttModel: input.sttModel,
    llmProvider: input.llmProvider,
    llmModel: input.llmModel,
    ttsProvider: input.ttsProvider,
    ttsModel: input.ttsModel,
    voice: input.voice,
    temperature: input.temperature,
    speed: input.speed,
    greeting: input.greeting,
    systemPrompt: input.systemPrompt,
    ragEnabled: input.ragEnabled,
    saveConversations: input.saveConversations,
  };
  for (const key of Object.keys(values)) {
    if (values[key] === undefined) delete values[key];
  }
  values.updatedAt = new Date();

  if (existing) {
    const [row] = await c.db.update(voiceConfigs).set(values).where(eq(voiceConfigs.id, existing.id)).returning();
    return row;
  }
  const [row] = await c.db.insert(voiceConfigs).values(values as typeof voiceConfigs.$inferInsert).returning();
  return row;
}

export interface VoiceReplyResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  sources: { id: string; title: string; type: string }[];
}

export async function getVoiceReply(opts: {
  text: string;
  language: "en" | "fa";
}): Promise<VoiceReplyResult> {
  const language = opts.language === "fa" ? "fa" : "en";
  const config = await getVoiceConfig();
  const rag = config?.ragEnabled !== false ? await buildRagContext(opts.text, language) : { context: "", sources: [] };

  const systemPrompt =
    config?.systemPrompt ||
    (language === "fa"
      ? "تو دستیار صوتی AutoAI هستی. کوتاه، واضح و برای پاسخ گفتاری پاسخ بده."
      : "You are the AutoAI voice assistant. Answer clearly and concisely, in a way that sounds natural when spoken aloud.");

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(rag.context
      ? [{ role: "system" as const, content: `Knowledge:\n${rag.context}` }]
      : []),
    { role: "user" as const, content: opts.text },
  ];

  const result = await routerChat({
    purpose: "voice",
    messages,
    runId: `voice-${Date.now()}`,
    temperature: config?.temperature ?? 50,
    maxTokens: 512,
    store: modelConfigStore,
  });

  logger.info(`voice reply from ${result.provider}/${result.model}`);
  return {
    text: result.value.text,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    sources: rag.sources,
  };
}
