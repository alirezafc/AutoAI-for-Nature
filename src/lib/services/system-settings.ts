import { eq } from "drizzle-orm";
import { systemSettings } from "@/db/schema";
import { getDb } from "@/db/client";
import { DatabaseError } from "@/lib/ai/errors";

export interface RagSourcesSettings {
  publishedArticles: boolean;
  curatedKnowledge: boolean;
  draftArticles: boolean;
}

export interface RagEmbeddingSettings {
  provider: string;
  model: string;
}

export interface RagChunkingSettings {
  chunkSize: number;
  chunkOverlap: number;
}

export interface RagSearchSettings {
  topK: number;
}

export interface AgentRevisionSettings {
  maxRounds: number;
  threshold: number;
  onMaxReached: "publish" | "draft" | "needs_review";
}

export interface SystemSettingsShape {
  "rag.sources": RagSourcesSettings;
  "rag.embedding": RagEmbeddingSettings;
  "rag.chunking": RagChunkingSettings;
  "rag.search": RagSearchSettings;
  "agent.revision": AgentRevisionSettings;
}

const DEFAULTS: SystemSettingsShape = {
  "rag.sources": { publishedArticles: true, curatedKnowledge: true, draftArticles: false },
  "rag.embedding": {
    provider: process.env.DEFAULT_EMBEDDING_PROVIDER || "mock",
    model: process.env.DEFAULT_EMBEDDING_MODEL || "autoai-demo-1",
  },
  "rag.chunking": { chunkSize: 900, chunkOverlap: 120 },
  "rag.search": { topK: 4 },
  "agent.revision": { maxRounds: 2, threshold: 80, onMaxReached: "needs_review" },
};

export type SettingsKey = keyof SystemSettingsShape;

export async function getSetting<K extends SettingsKey>(
  key: K
): Promise<SystemSettingsShape[K]> {
  try {
    const c = await getDb();
    const row = await c.db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, key),
    });
    if (!row) return DEFAULTS[key];
    return row.value as SystemSettingsShape[K];
  } catch (err) {
    // table may not exist before migrations
    console.warn(`getSetting(${key}) failed`, err);
    return DEFAULTS[key];
  }
}

export async function getAllSettings(): Promise<Partial<SystemSettingsShape>> {
  const out: Partial<SystemSettingsShape> = {};
  const c = await getDb();
  try {
    const rows = await c.db.select().from(systemSettings);
    for (const row of rows) {
      (out as Record<string, unknown>)[row.key] = row.value;
    }
  } catch {
    // ignore
  }
  return out;
}

export async function setSetting<K extends SettingsKey>(
  key: K,
  value: SystemSettingsShape[K]
): Promise<void> {
  const c = await getDb();
  await c.db
    .insert(systemSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export function getDefaultSettings(): SystemSettingsShape {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

export function throwDatabaseError(action: string, err: unknown): never {
  throw new DatabaseError(`${action} failed: ${err instanceof Error ? err.message : String(err)}`);
}
