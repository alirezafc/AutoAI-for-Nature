import { eq } from "drizzle-orm";
import { systemSettings } from "@/db/schema";
import { getDb } from "@/db/client";
import { resetProviderCache } from "@/lib/ai/registry";
import { setSetting } from "@/lib/services/system-settings";

export interface AiConnectionsConfig {
  keys: Record<string, string>;
  defaultProvider: string;
  defaultModel: string;
  embeddingProvider: string;
  embeddingModel: string;
}

const SETTINGS_KEY = "ai.connections";

const DEFAULTS: AiConnectionsConfig = {
  keys: {},
  defaultProvider: "mock",
  defaultModel: "autoai-demo-1",
  embeddingProvider: "mock",
  embeddingModel: "autoai-demo-1",
};

const ENV_FOR_PROVIDER: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
};

const BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
};

export async function getAiConnections(): Promise<AiConnectionsConfig> {
  try {
    const c = await getDb();
    const row = await c.db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, SETTINGS_KEY),
    });
    if (row?.value && typeof row.value === "object") {
      const stored = row.value as Partial<AiConnectionsConfig>;
      return {
        ...DEFAULTS,
        ...stored,
        keys: { ...(stored.keys ?? {}) },
      };
    }
  } catch {
    // settings table may not exist yet
  }
  return { ...DEFAULTS, keys: {} };
}

export async function saveAiConnections(cfg: AiConnectionsConfig): Promise<void> {
  const c = await getDb();
  await c.db
    .insert(systemSettings)
    .values({ key: SETTINGS_KEY, value: cfg, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: cfg, updatedAt: new Date() },
    });
  // Keep the RAG embedding setting aligned with the single source of truth.
  await upsertRagEmbedding(cfg);
  await applyAiConnections();
}

/** The effective embedding provider/model, from persistent config. */
export async function getEmbeddingConfig(): Promise<{ provider: string; model: string }> {
  const cfg = await getAiConnections();
  return { provider: cfg.embeddingProvider, model: cfg.embeddingModel };
}

async function upsertRagEmbedding(cfg: AiConnectionsConfig): Promise<void> {
  try {
    await setSetting("rag.embedding", {
      provider: cfg.embeddingProvider,
      model: cfg.embeddingModel,
    });
  } catch {
    // settings row insert may be unavailable during early boot; env fallback covers it
  }
}

/** Snapshot of env values at first load, so clearing a stored key can restore them. */
let originalEnv: Record<string, string | undefined> | null = null;

function envSnapshot(): Record<string, string | undefined> {
  if (!originalEnv) {
    originalEnv = {};
    for (const env of Object.values(ENV_FOR_PROVIDER)) {
      originalEnv[env] = process.env[env];
    }
  }
  return originalEnv;
}

/** Push stored keys into process.env and reset provider cache so live providers pick them up. */
export async function applyAiConnections(): Promise<{ applied: string[] }> {
  const cfg = await getAiConnections();
  const snapshot = envSnapshot();
  const applied: string[] = [];
  for (const env of Object.values(ENV_FOR_PROVIDER)) {
    const stored = cfg.keys[env]?.trim() ?? "";
    const original = snapshot[env] ?? "";
    const current = process.env[env] ?? "";
    if (stored) {
      if (current !== stored) {
        process.env[env] = stored;
        applied.push(env);
      }
    } else {
      // no stored key -> restore whatever env had originally (.env.local / shell)
      if (current !== original) {
        if (original) process.env[env] = original;
        else delete process.env[env];
        applied.push(env);
      }
    }
  }
  if (cfg.defaultProvider) process.env.DEFAULT_AI_PROVIDER = cfg.defaultProvider;
  if (cfg.defaultModel) process.env.DEFAULT_AI_MODEL = cfg.defaultModel;
  if (cfg.embeddingProvider) process.env.DEFAULT_EMBEDDING_PROVIDER = cfg.embeddingProvider;
  if (cfg.embeddingModel) process.env.DEFAULT_EMBEDDING_MODEL = cfg.embeddingModel;
  await upsertRagEmbedding(cfg);
  resetProviderCache();
  return { applied };
}

export interface ConnectionTestResult {
  provider: string;
  name: string;
  ok: boolean;
  configured: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Lightweight connectivity check against the provider's models endpoint.
 * Validates the API key without consuming tokens.
 */
export async function testProviderConnection(
  providerKey: string,
  apiKey: string | undefined
): Promise<ConnectionTestResult> {
  const name = providerKey.toUpperCase();
  const base = BASE_URLS[providerKey];
  const env = ENV_FOR_PROVIDER[providerKey];

  if (!base || !env) {
    return { provider: providerKey, name, ok: false, configured: false, error: "unsupported provider" };
  }
  if (!apiKey) {
    return { provider: providerKey, name, ok: false, configured: false, error: "no api key" };
  }

  const started = Date.now();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (providerKey === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(`${base}/models`, { method: "GET", headers, signal: AbortSignal.timeout(10000) });
    const ok = res.ok || res.status === 200 || res.status === 404;
    return {
      provider: providerKey,
      name,
      ok: ok && res.status !== 401 && res.status !== 403,
      configured: true,
      status: res.status,
      latencyMs: Date.now() - started,
      error: ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      provider: providerKey,
      name,
      ok: false,
      configured: true,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Test every provider that has a stored or env key. */
export async function testAllConnections(): Promise<ConnectionTestResult[]> {
  const cfg = await getAiConnections();
  const results: ConnectionTestResult[] = [];
  for (const [providerKey, env] of Object.entries(ENV_FOR_PROVIDER)) {
    const key = cfg.keys[env] ?? process.env[env];
    if (!key) continue;
    results.push(await testProviderConnection(providerKey, key));
  }
  return results;
}

export function providerEnvFor(key: string): string | undefined {
  return ENV_FOR_PROVIDER[key];
}

export interface DeepCallResult {
  ok: boolean;
  model: string | null;
  latencyMs?: number;
  dimensions?: number;
  error?: string;
}

export interface DeepTestResult {
  provider: string;
  name: string;
  configured: boolean;
  chat: DeepCallResult | null;
  embedding: DeepCallResult | null;
}

// Providers with an OpenAI-compatible /chat/completions + /embeddings surface
// for real deep testing. Anthropic uses a different API shape and is covered by
// the lightweight /models check instead (chat/embedding deep tests skipped).
const DEEP_OPENAI_COMPATIBLE = new Set(["openai", "openrouter", "groq", "google"]);

function bearerHeaders(providerKey: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (providerKey === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Deep connection test: actually perform a real chat completion AND a real
 * embedding request against the provider (when the provider supports it).
 * Reports provider, model, success/failure, latency and error per call.
 */
export async function testProviderDeep(
  providerKey: string,
  apiKey: string,
  cfg: AiConnectionsConfig
): Promise<DeepTestResult> {
  const name = providerKey.toUpperCase();
  const base = BASE_URLS[providerKey];
  const env = ENV_FOR_PROVIDER[providerKey];
  if (!base || !env || !DEEP_OPENAI_COMPATIBLE.has(providerKey)) {
    return { provider: providerKey, name, configured: Boolean(apiKey), chat: null, embedding: null };
  }

  const { getProvider } = await import("@/lib/ai/registry");
  const provider = getProvider(providerKey);
  const headers = bearerHeaders(providerKey, apiKey);

  async function chatCall(): Promise<DeepCallResult> {
    if (!provider) return { ok: false, model: null, error: "provider not registered" };
    const chatModels = provider.models().filter((m) => !m.supportsEmbeddings && m.id !== "openrouter/auto").map((m) => m.id);
    const model = cfg.defaultProvider === providerKey && cfg.defaultModel !== "autoai-demo-1" && chatModels.includes(cfg.defaultModel)
      ? cfg.defaultModel
      : (chatModels.find((id) => id === "openrouter/free") ?? chatModels[0]);
    if (!model) return { ok: false, model: null, error: "no chat model available for deep test" };
    const started = Date.now();
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
          max_tokens: 8,
          stream: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, model, latencyMs, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? "";
      return { ok: Boolean(text.trim()), model, latencyMs, error: text.trim() ? undefined : "empty response" };
    } catch (err) {
      return { ok: false, model, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function embeddingCall(): Promise<DeepCallResult | null> {
    if (!provider?.generateEmbedding) return null;
    const embModels = provider.models().filter((m) => m.supportsEmbeddings).map((m) => m.id);
    const model =
      cfg.embeddingProvider === providerKey && embModels.includes(cfg.embeddingModel)
        ? cfg.embeddingModel
        : embModels[0];
    if (!model) return null;
    const started = Date.now();
    try {
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, input: "ping" }),
        signal: AbortSignal.timeout(30_000),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, model, latencyMs, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
      }
      const data = (await res.json()) as { data?: { embedding?: number[] }[] };
      const embedding = data.data?.[0]?.embedding ?? [];
      return { ok: embedding.length > 0, model, latencyMs, dimensions: embedding.length || undefined };
    } catch (err) {
      return { ok: false, model, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const [chat, embedding] = await Promise.all([chatCall(), embeddingCall()]);
  return { provider: providerKey, name, configured: true, chat, embedding };
}

/** Real deep tests for every provider that has a stored or env key. */
export async function testAllConnectionsDeep(): Promise<DeepTestResult[]> {
  const cfg = await getAiConnections();
  const results: DeepTestResult[] = [];
  for (const [providerKey, env] of Object.entries(ENV_FOR_PROVIDER)) {
    const key = cfg.keys[env] ?? process.env[env];
    if (!key) continue;
    results.push(await testProviderDeep(providerKey, key, cfg));
  }
  return results;
}
