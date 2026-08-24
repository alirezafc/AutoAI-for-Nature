import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";

export const modelProviders = pgTable(
  "model_providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    type: text("type").notNull().default("openai-compatible"),
    baseUrl: text("base_url"),
    apiKeyEnv: text("api_key_env"),
    enabled: boolean("enabled").notNull().default(true),
    free: boolean("free").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("model_providers_key_idx").on(t.key)]
);

export const modelConfigs = pgTable(
  "model_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purpose: text("purpose").notNull().unique(),
    label: text("label").notNull(),
    primaryProvider: text("primary_provider").notNull().default("mock"),
    primaryModel: text("primary_model").notNull().default("autoai-demo-1"),
    fallbackProvider: text("fallback_provider").notNull().default("mock"),
    fallbackModel: text("fallback_model").notNull().default("autoai-demo-1"),
    temperature: integer("temperature").notNull().default(70),
    maxTokens: integer("max_tokens").notNull().default(2048),
    ragEnabled: boolean("rag_enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("model_configs_purpose_idx").on(t.purpose)]
);

export const voiceConfigs = pgTable(
  "voice_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sttProvider: text("stt_provider").notNull().default("browser"),
    sttModel: text("stt_model").notNull().default("browser-default"),
    llmProvider: text("llm_provider").notNull().default("mock"),
    llmModel: text("llm_model").notNull().default("autoai-demo-1"),
    ttsProvider: text("tts_provider").notNull().default("browser"),
    ttsModel: text("tts_model").notNull().default("browser-default"),
    voice: text("voice").notNull().default("default"),
    temperature: integer("temperature").notNull().default(70),
    speed: integer("speed").notNull().default(100),
    greeting: text("greeting").notNull().default("Hello! I am AutoAI. Ask me about nature, wildlife and the environment."),
    systemPrompt: text("system_prompt").notNull().default("You are the AutoAI voice assistant, an expert on nature, wildlife and the environment. Answer clearly and concisely for a spoken reply."),
    ragEnabled: boolean("rag_enabled").notNull().default(true),
    saveConversations: boolean("save_conversations").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const voiceModels = pgTable(
  "voice_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(), // stt | tts | llm
    free: boolean("free").notNull().default(true),
    language: text("language").notNull().default("en"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    latencyMs: integer("latency_ms"),
    measuredAt: timestamp("measured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("voice_models_kind_idx").on(t.kind)]
);

export type ModelProvider = typeof modelProviders.$inferSelect;
export type NewModelProvider = typeof modelProviders.$inferInsert;
export type ModelConfig = typeof modelConfigs.$inferSelect;
export type NewModelConfig = typeof modelConfigs.$inferInsert;
export type VoiceConfig = typeof voiceConfigs.$inferSelect;
export type VoiceModel = typeof voiceModels.$inferSelect;
