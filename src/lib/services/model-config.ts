import { eq } from "drizzle-orm";
import { modelConfigs, modelProviders } from "@/db/schema";
import { getDb } from "@/db/client";
import { defaultModelConfig } from "@/lib/ai/defaults";
import type { ModelPurpose, ModelPurposeConfig, ModelConfigStore } from "@/lib/ai/types";

export async function listModelConfigs() {
  const c = await getDb();
  return c.db.select().from(modelConfigs).orderBy(modelConfigs.purpose);
}

export async function getPurposeConfig(purpose: ModelPurpose): Promise<ModelPurposeConfig | undefined> {
  try {
    const c = await getDb();
    const rows = await c.db.select().from(modelConfigs).where(eq(modelConfigs.purpose, purpose)).limit(1);
    if (!rows[0]) return defaultModelConfig(purpose);
    const row = rows[0];
    return {
      purpose: row.purpose as ModelPurpose,
      label: row.label,
      primaryProvider: row.primaryProvider,
      primaryModel: row.primaryModel,
      fallbackProvider: row.fallbackProvider,
      fallbackModel: row.fallbackModel,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      ragEnabled: row.ragEnabled,
    };
  } catch {
    return defaultModelConfig(purpose);
  }
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
