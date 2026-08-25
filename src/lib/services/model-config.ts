import { eq } from "drizzle-orm";
import { modelConfigs, modelProviders } from "@/db/schema";
import { getDb } from "@/db/client";
import { defaultModelConfig } from "@/lib/ai/defaults";
import { getProvider } from "@/lib/ai/registry";
import { getAiConnections } from "@/lib/services/ai-connections";
import type { ModelPurpose, ModelPurposeConfig, ModelConfigStore } from "@/lib/ai/types";

export async function listModelConfigs() {
  const c = await getDb();
  return c.db.select().from(modelConfigs).orderBy(modelConfigs.purpose);
}

/**
 * Mandated production bootstrap pair. Used ONLY as the lowest-priority
 * fallback when no explicit default exists anywhere (AI Connections default,
 * per-purpose override, DEFAULT_AI_* env) while a real OpenRouter credential
 * IS configured. It can never override an explicit configuration; it exists so
 * an env-key-only deployment ("OpenRouter connected" in Admin → Settings)
 * resolves every agent purpose to the verified production model instead of
 * the demo mock.
 */
export const PRODUCTION_BOOTSTRAP: { provider: string; model: string } = {
  provider: "openrouter",
  model: "openai/gpt-4o-mini",
};

function isRealProvider(p: string | undefined | null): boolean {
  return Boolean(p && p !== "mock");
}

/** Minimal shape of a stored model_configs row used for resolution. */
export interface PurposeConfigRowLike {
  primaryProvider: string;
  primaryModel: string;
  fallbackProvider: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  ragEnabled: boolean;
}

/**
 * ONE deterministic precedence chain for effective agent-model configuration:
 *
 *   1. explicit per-purpose override row  (Models page save)
 *      — honored only when its PRIMARY slot is a real provider;
 *        any MOCK slot (primary or fallback) is treated as stale and replaced
 * 2. AI Connections default                (Admin → Settings, purpose-aware:
 *        embedding purposes use embeddingProvider/embeddingModel)
 * 3. production bootstrap                  (only when a real OpenRouter
 *        credential exists and NOTHING else is configured)
 * 4. demo/mock legacy behavior             (no credentials anywhere)
 *
 * A stale mock configuration can therefore never override a valid real
 * provider default, mock remains available for demo mode and automated tests,
 * and the admin never has to configure the same thing twice.
 */
export function resolveEffectivePurposeConfig(args: {
  purpose: ModelPurpose;
  row?: PurposeConfigRowLike | null;
  connectionDefault: { provider: string; model: string };
  providerConfigured: (providerKey: string) => boolean;
}): ModelPurposeConfig {
  const base = defaultModelConfig(args.purpose);
  const row = args.row ?? null;

  const connReal =
    isRealProvider(args.connectionDefault.provider) && Boolean(args.connectionDefault.model);
  const bootstrapReady =
    !connReal &&
    PRODUCTION_BOOTSTRAP.provider !== "mock" &&
    args.providerConfigured(PRODUCTION_BOOTSTRAP.provider);
  const effDefault: { provider: string; model: string } | null = connReal
    ? { provider: args.connectionDefault.provider, model: args.connectionDefault.model }
    : bootstrapReady
      ? { provider: PRODUCTION_BOOTSTRAP.provider, model: PRODUCTION_BOOTSTRAP.model }
      : null;

  // No real default anywhere -> legacy demo semantics (mock allowed).
  if (!effDefault) {
    if (!row) return base;
    return {
      ...base,
      primaryProvider: row.primaryProvider,
      primaryModel: row.primaryModel,
      fallbackProvider: row.fallbackProvider,
      fallbackModel: row.fallbackModel,
      temperature: row.temperature ?? base.temperature,
      maxTokens: row.maxTokens ?? base.maxTokens,
      ragEnabled: row.ragEnabled ?? base.ragEnabled,
    };
  }

  // Real default layer active: stale MOCK slots must never win.
  let primary = { ...effDefault };
  let fallback = { ...effDefault };
  let temperature = base.temperature;
  let maxTokens = base.maxTokens;
  let ragEnabled = base.ragEnabled;

  if (row && isRealProvider(row.primaryProvider)) {
    primary = { provider: row.primaryProvider, model: row.primaryModel };
    temperature = row.temperature;
    maxTokens = row.maxTokens;
    ragEnabled = row.ragEnabled;
    fallback = isRealProvider(row.fallbackProvider)
      ? { provider: row.fallbackProvider, model: row.fallbackModel }
      : { ...primary }; // stale mock fallback -> mirror the explicit primary
  }

  return {
    ...base,
    primaryProvider: primary.provider,
    primaryModel: primary.model,
    fallbackProvider: fallback.provider,
    fallbackModel: fallback.model,
    temperature,
    maxTokens,
    ragEnabled,
  };
}

function connectionDefaultFor(
  cfg: Awaited<ReturnType<typeof getAiConnections>>,
  purpose: ModelPurpose
): { provider: string; model: string } {
  return purpose === "embedding"
    ? { provider: cfg.embeddingProvider, model: cfg.embeddingModel }
    : { provider: cfg.defaultProvider, model: cfg.defaultModel };
}

export async function getPurposeConfig(purpose: ModelPurpose): Promise<ModelPurposeConfig | undefined> {
  let row: PurposeConfigRowLike | null = null;
  try {
    const c = await getDb();
    const rows = await c.db.select().from(modelConfigs).where(eq(modelConfigs.purpose, purpose)).limit(1);
    if (rows[0]) row = rows[0];
  } catch {
    row = null; // config table unavailable -> fall through to connection default/bootstrap
  }

  let connectionDefault = { provider: "", model: "" };
  try {
    const conn = await getAiConnections();
    connectionDefault = connectionDefaultFor(conn, purpose);
  } catch {
    connectionDefault = { provider: "", model: "" };
  }

  return resolveEffectivePurposeConfig({
    purpose,
    row,
    connectionDefault,
    providerConfigured: (key) => getProvider(key)?.isConfigured() ?? false,
  });
}

export const modelConfigStore: ModelConfigStore = {
  getPurposeConfig,
};

export async function upsertModelConfig(input: {
  purpose: ModelPurpose;
  label?: string;
  primaryProvider?: string;
  primaryModel?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  temperature?: number;
  maxTokens?: number;
  ragEnabled?: boolean;
}) {
  const c = await getDb();
  const existing = await c.db.select().from(modelConfigs).where(eq(modelConfigs.purpose, input.purpose)).limit(1);
  const values = {
    label: input.label,
    primaryProvider: input.primaryProvider,
    primaryModel: input.primaryModel,
    fallbackProvider: input.fallbackProvider,
    fallbackModel: input.fallbackModel,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    ragEnabled: input.ragEnabled,
    updatedAt: new Date(),
  };
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    if (values[key] === undefined) delete (values as Record<string, unknown>)[key];
  }
  if (existing[0]) {
    const [row] = await c.db.update(modelConfigs).set(values).where(eq(modelConfigs.id, existing[0].id)).returning();
    return row;
  }
  const [row] = await c.db
    .insert(modelConfigs)
    .values({
      purpose: input.purpose,
      label: input.label ?? input.purpose,
      primaryProvider: input.primaryProvider ?? "mock",
      primaryModel: input.primaryModel ?? "autoai-demo-1",
      fallbackProvider: input.fallbackProvider ?? "mock",
      fallbackModel: input.fallbackModel ?? "autoai-demo-1",
      temperature: input.temperature ?? 70,
      maxTokens: input.maxTokens ?? 2048,
      ragEnabled: input.ragEnabled ?? false,
    })
    .returning();
  return row;
}

export async function listModelProviders() {
  const c = await getDb();
  return c.db.select().from(modelProviders).orderBy(modelProviders.createdAt);
}
