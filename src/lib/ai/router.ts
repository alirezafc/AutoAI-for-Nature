import {
  getProvider,
  MOCK_PROVIDER_KEY,
} from "./registry";
import {
  PROVIDER_ERROR_CODES,
  ProviderError,
  errorMessage,
} from "./errors";
import { AI_CONNECTIONS_HINT, mockAllowedInProcess } from "./production-guard";
import type {
  AttemptInfo,
  ChatMessage,
  ModelConfigStore,
  ModelPurpose,
  ModelPurposeConfig,
  RouterResult,
  GenerateTextResponse,
  EmbeddingResponse,
} from "./types";
import { defaultModelConfig } from "./defaults";

export interface RouterChatOptions {
  purpose: ModelPurpose;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
  jsonSchema?: unknown;
  signal?: AbortSignal;
  runId?: string;
  store?: ModelConfigStore;
   stream?: boolean;
   onChunk?: (chunk: string) => void;
   /** Observability: fired for every failed provider attempt (even when the overall call then throws). */
   onErrorAttempt?: (info: { provider: string; model: string; latencyMs: number; error: string }) => void;
 }

const DEFAULT_TIMEOUT_MS = 120_000;

async function resolveConfig(
  purpose: ModelPurpose,
  store: ModelConfigStore | undefined
): Promise<ModelPurposeConfig> {
  if (store) {
    const found = await store.getPurposeConfig(purpose);
    if (found) return found;
  }
  return defaultModelConfig(purpose);
}

function dedupeAttempts(config: ModelPurposeConfig): { provider: string; model: string }[] {
  const list = [
    { provider: config.primaryProvider, model: config.primaryModel },
    { provider: config.fallbackProvider, model: config.fallbackModel },
  ];
  const seen = new Set<string>();
  return list.filter((a) => {
    if (!a.provider || !a.model) return false;
    const key = `${a.provider}:${a.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The mock provider is for automated tests only (AUTOAI_ALLOW_MOCK=1, set by
 * the vitest runner). In every other process a mock attempt is a hard failure
 * so no user-facing path can ever produce fake content or fake embeddings.
 */
function vetoMockAttempt(attempt: { provider: string; model: string }): void {
  if (attempt.provider !== MOCK_PROVIDER_KEY || mockAllowedInProcess()) return;
  throw new ProviderError(
    PROVIDER_ERROR_CODES.NOT_CONFIGURED,
    `Mock provider is disabled outside automated tests (attempted ${attempt.provider}/${attempt.model}). ${AI_CONNECTIONS_HINT}`
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ProviderError(PROVIDER_ERROR_CODES.TIMEOUT, `Request timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Runs the provider call with a hard deadline. The provider receives a real
 * AbortSignal so the underlying HTTP fetch is actually cancelled — no zombie
 * requests hanging for minutes after the caller already timed out.
 */
async function withTimeoutSignal<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new ProviderError(PROVIDER_ERROR_CODES.TIMEOUT, `Provider call aborted after ${ms}ms timeout`)),
    ms
  );
  try {
    return await withTimeout(fn(controller.signal), ms);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Primary/fallback chat completion. Application code (not the LLM) decides
 * ordering, fallback activation and retry policy.
 */
export async function routerChat(opts: RouterChatOptions): Promise<
  RouterResult<GenerateTextResponse>
> {
  const config = await resolveConfig(opts.purpose, opts.store);
  const attempts = dedupeAttempts(config);
  const runId = opts.runId ?? "run";
  const attemptsLog: AttemptInfo[] = [];
  const logger = (await import("../logging")).logger;

  if (attempts.length === 0) {
    throw new ProviderError(PROVIDER_ERROR_CODES.ALL_FAILED, "No provider configured for purpose");
  }

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const provider = getProvider(attempt.provider);
    const started = Date.now();
    try {
      vetoMockAttempt(attempt);
      if (!provider) {
        throw new ProviderError(PROVIDER_ERROR_CODES.API_FAILURE, `Unknown provider: ${attempt.provider}`);
      }
      if (!provider.isConfigured()) {
        throw new ProviderError(
          PROVIDER_ERROR_CODES.NOT_CONFIGURED,
          `Provider "${attempt.provider}" is not configured. Set ${provider.getApiKeyEnv() ?? attempt.provider.toUpperCase() + "_API_KEY"}`
        );
      }
      const params = {
        provider: attempt.provider,
        model: attempt.model,
        messages: opts.messages,
        temperature: opts.temperature ?? config.temperature ?? 70,
        maxTokens: opts.maxTokens ?? config.maxTokens ?? 2048,
        json: opts.json,
        jsonSchema: opts.jsonSchema,
        signal: opts.signal,
        runId,
        purpose: opts.purpose,
      };

      const result =
        opts.stream && provider.streamText
          ? await withTimeoutSignal(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, (signal) =>
              provider.streamText!({ ...params, signal }, opts.onChunk ?? (() => undefined)))
          : await withTimeoutSignal(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, (signal) =>
              provider.generateText({ ...params, signal }));

      attemptsLog.push({ provider: attempt.provider, model: attempt.model, latencyMs: result.latencyMs, ok: true });
      return {
        value: result,
        provider: attempt.provider,
        model: attempt.model,
        latencyMs: result.latencyMs,
        attempts: attemptsLog,
        fallbackUsed: i > 0,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      };
    } catch (err) {
      lastError = err;
      const latency = Date.now() - started;
      attemptsLog.push({
        provider: attempt.provider,
        model: attempt.model,
        latencyMs: latency,
        ok: false,
        error: errorMessage(err),
      });
      logger.warn(`[${runId}] provider ${attempt.provider}/${attempt.model} failed: ${errorMessage(err)}`, {
        purpose: opts.purpose,
        provider: attempt.provider,
        model: attempt.model,
        latencyMs: latency,
      });
      opts.onErrorAttempt?.({ provider: attempt.provider, model: attempt.model, latencyMs: latency, error: errorMessage(err) });
    }
  }

  const failed = attemptsLog.filter((a) => !a.ok);
  const detail = failed
    .map((a) => `${a.provider}/${a.model} (${a.latencyMs}ms): ${a.error}`)
    .join("; ");
  throw new ProviderError(
    PROVIDER_ERROR_CODES.ALL_FAILED,
    attempts.length === 1 ? `Primary provider failed: ${errorMessage(lastError)}` : `All ${attempts.length} provider attempts failed. ${detail}`
  );
}

export interface RouterEmbeddingOptions {
  provider?: string;
  model?: string;
  text: string;
  timeoutMs?: number;
  runId?: string;
  store?: ModelConfigStore;
  signal?: AbortSignal;
}

/**
 * Primary/fallback embedding with strict dimension validation against the
 * canonical vector column size (see EMBEDDING_DIMENSIONS).
 */
export async function routerEmbedding(
  opts: RouterEmbeddingOptions
): Promise<RouterResult<EmbeddingResponse>> {
  const config = await resolveConfig("embedding", opts.store);
  const seen = new Set<string>();
  const attempts = [
    { provider: opts.provider ?? config.primaryProvider, model: opts.model ?? config.primaryModel },
    { provider: config.fallbackProvider, model: config.fallbackModel },
  ].filter((a) => {
    if (!a.provider || !a.model) return false;
    const key = `${a.provider}:${a.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const attemptsLog: AttemptInfo[] = [];
  if (attempts.length === 0) {
    throw new ProviderError(PROVIDER_ERROR_CODES.ALL_FAILED, "No embedding provider configured for purpose");
  }

  let lastError: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const provider = getProvider(attempt.provider);
    const started = Date.now();
    try {
      vetoMockAttempt(attempt);
      if (!provider?.generateEmbedding) {
        throw new ProviderError(PROVIDER_ERROR_CODES.API_FAILURE, `Provider ${attempt.provider} cannot embed`);
      }
      if (!provider.isConfigured()) {
        throw new ProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, `Provider ${attempt.provider} is not configured`);
      }
      const result = await withTimeoutSignal(opts.timeoutMs ?? 30_000, (signal) =>
        provider.generateEmbedding!({
          provider: attempt.provider,
          model: attempt.model,
          text: opts.text,
          runId: opts.runId,
          signal,
        })
      );
      const normalized = normalizeEmbedding(result.embedding);
      attemptsLog.push({ provider: attempt.provider, model: attempt.model, latencyMs: result.latencyMs, ok: true });
      return {
        value: { ...result, embedding: normalized },
        provider: attempt.provider,
        model: attempt.model,
        latencyMs: result.latencyMs,
        attempts: attemptsLog,
        fallbackUsed: i > 0,
      };
    } catch (err) {
      lastError = err;
      attemptsLog.push({ provider: attempt.provider, model: attempt.model, latencyMs: Date.now() - started, ok: false, error: errorMessage(err) });
    }
  }
  const msg =
    attemptsLog.length === 1
      ? `Embedding provider failed: ${errorMessage(lastError)}`
      : `Primary and fallback embedding providers failed. Last error: ${errorMessage(lastError)}`;
  throw new ProviderError(PROVIDER_ERROR_CODES.ALL_FAILED, msg);
}

import { EMBEDDING_DIMENSIONS } from "@/db/schema/common";

/**
 * Embedding dimension contract: provider output MUST already match the
 * canonical pgvector column dimension exactly (see EMBEDDING_DIMENSIONS).
 * Vectors are never truncated or padded — mixing/padding would silently
 * corrupt similarity search. A mismatch is a configuration error: switch the
 * embedding model to one that emits EMBEDDING_DIMENSIONS dimensions and
 * re-index the knowledge base.
 */
export function normalizeEmbedding(raw: number[]): number[] {
  if (raw.length !== EMBEDDING_DIMENSIONS) {
    throw new ProviderError(
      PROVIDER_ERROR_CODES.INVALID_RESPONSE,
      `Embedding dimension mismatch: provider returned ${raw.length} dimensions but the vector store requires ${EMBEDDING_DIMENSIONS}. Configure an embedding model that emits ${EMBEDDING_DIMENSIONS} dimensions, then re-index the knowledge base (changing embedding models always requires a full re-index).`
    );
  }
  return raw;
}

export function embeddingToSqlString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
