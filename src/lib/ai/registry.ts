import type { AIProvider, ModelInfo } from "./types";
import { MockProvider } from "./providers/mock";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";

export const MOCK_PROVIDER_KEY = "mock";
export const DEFAULT_EMBEDDING_PROVIDER = "mock";
export const DEFAULT_EMBEDDING_MODEL = "autoai-demo-1";

// Process-wide singleton (see db/client.ts): Next.js dev can duplicate this
// module per route bundle; provider instances must be shared, not duplicated.
const globalStore = globalThis as { __autoaiProviders?: AIProvider[] | null };

export function getProviders(): AIProvider[] {
  if (globalStore.__autoaiProviders) return globalStore.__autoaiProviders;

  const openrouter = new OpenAiCompatibleProvider({
    key: "openrouter",
    name: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    // Overridable for local integration tests (fake OpenAI-compatible server).
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    models: [
      {
        id: "openrouter/free",
        name: "OpenRouter Free (auto-select)",
        provider: "openrouter",
        free: true,
        supportsJson: true,
        supportsStreaming: true,
        autoResolve: true,
        description: "Automatically picks an available :free model at request time.",
      },
      {
        id: "openrouter/auto",
        name: "OpenRouter Auto (best available)",
        provider: "openrouter",
        free: false,
        supportsJson: true,
        supportsStreaming: true,
        autoResolve: true,
        description: "OpenRouter's routing for the best available configured model.",
      },
      { id: "deepseek/deepseek-chat-v3-0324:free", name: "DeepSeek V3 (free)", provider: "openrouter", free: true, supportsJson: true, supportsStreaming: true },
      { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (free)", provider: "openrouter", free: true, supportsJson: true, supportsStreaming: true },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", provider: "openrouter", free: true, supportsJson: true, supportsStreaming: true },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "openrouter", free: false, supportsJson: true, supportsStreaming: true },
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "openrouter", free: false, supportsJson: true, supportsStreaming: true },
      {
        id: "nvidia/nemotron-3-embed-1b:free",
        name: "Nemotron 3 Embed 1B (free)",
        provider: "openrouter",
        free: true,
        supportsEmbeddings: true,
        description: "Embedding model served via the OpenRouter /embeddings endpoint.",
      },
    ],
  });

  const openai = new OpenAiCompatibleProvider({
    key: "openai",
    name: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    defaultEmbeddingModel: "text-embedding-3-small",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai", free: false, supportsJson: true, supportsStreaming: true },
      { id: "gpt-4o", name: "GPT-4o", provider: "openai", free: false, supportsJson: true, supportsStreaming: true },
      { id: "text-embedding-3-small", name: "text-embedding-3-small", provider: "openai", free: false, supportsEmbeddings: true },
    ],
  });

  const groq = new OpenAiCompatibleProvider({
    key: "groq",
    name: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile (free)", provider: "groq", free: true, supportsJson: true, supportsStreaming: true },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (free)", provider: "groq", free: true, supportsJson: true, supportsStreaming: true },
      { id: "gemma2-9b-it", name: "Gemma 2 9B (free)", provider: "groq", free: true, supportsJson: true, supportsStreaming: true },
    ],
  });

  const google = new GeminiProvider({
    key: "google",
    name: "Google Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: GeminiProvider.geminiModels(),
  });

  const anthropic = new AnthropicProvider({
    key: "anthropic",
    name: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "anthropic", free: false, supportsJson: true, supportsStreaming: true },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku", provider: "anthropic", free: false, supportsJson: true, supportsStreaming: true },
    ],
  });

  globalStore.__autoaiProviders = [new MockProvider(), openrouter, openai, anthropic, google, groq];
  return globalStore.__autoaiProviders;
}

export function getProvider(key: string | undefined | null): AIProvider | undefined {
  if (!key) return undefined;
  return getProviders().find((p) => p.key === key);
}

export function getProviderOrMock(key: string | undefined | null): AIProvider {
  return getProvider(key) ?? new MockProvider();
}

export function listProviders(): AIProvider[] {
  return getProviders();
}

export function listChatModels(): ModelInfo[] {
  return getProviders().flatMap((p) => p.models());
}

export function listEmbeddingModels(): ModelInfo[] {
  return getProviders().flatMap((p) =>
    p.models().filter((m) => m.supportsEmbeddings && p.generateEmbedding)
  );
}

export function isProviderConfigured(key: string): boolean {
  const p = getProvider(key);
  return p ? p.isConfigured() : false;
}

export interface ConfiguredModelSummary {
  provider: string;
  providerName: string;
  configured: boolean;
  free: boolean;
  models: ModelInfo[];
}

export function listConfiguredModels(): ConfiguredModelSummary[] {
  return getProviders().map((p) => ({
    provider: p.key,
    providerName: p.name,
    configured: p.isConfigured(),
    free: p.key === MOCK_PROVIDER_KEY,
    models: p.models(),
  }));
}

export function configuredProviderCount(): number {
  return getProviders().filter((p) => p.key !== MOCK_PROVIDER_KEY && p.isConfigured()).length;
}

export function resetProviderCache(): void {
  globalStore.__autoaiProviders = null;
}
