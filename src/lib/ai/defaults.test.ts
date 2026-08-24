import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defaultModelConfig } from "./defaults";

const SAVED: Record<string, string | undefined> = {};

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  SAVED.DEFAULT_AI_PROVIDER = process.env.DEFAULT_AI_PROVIDER;
  SAVED.DEFAULT_AI_MODEL = process.env.DEFAULT_AI_MODEL;
  SAVED.DEFAULT_EMBEDDING_PROVIDER = process.env.DEFAULT_EMBEDDING_PROVIDER;
  SAVED.DEFAULT_EMBEDDING_MODEL = process.env.DEFAULT_EMBEDDING_MODEL;
});

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) setEnv(k, v);
});

describe("defaultModelConfig — real provider must never silently fall back to mock", () => {
  it("mirrors the primary provider when a real provider is configured", () => {
    setEnv("DEFAULT_AI_PROVIDER", "openrouter");
    setEnv("DEFAULT_AI_MODEL", "openrouter/free");
    for (const purpose of ["chatbot", "writer", "voice", "critic"] as const) {
      const cfg = defaultModelConfig(purpose);
      expect(cfg.fallbackProvider).toBe("openrouter");
      expect(cfg.fallbackModel).toBe("openrouter/free");
    }
  });

  it("keeps the mock fallback only when the primary IS the mock (demo mode)", () => {
    setEnv("DEFAULT_AI_PROVIDER", "mock");
    setEnv("DEFAULT_AI_MODEL", "autoai-demo-1");
    const cfg = defaultModelConfig("chatbot");
    expect(cfg.primaryProvider).toBe("mock");
    expect(cfg.fallbackProvider).toBe("mock");
  });

  it("embedding purpose uses the configured embedding provider and mirrors it for real providers", () => {
    setEnv("DEFAULT_EMBEDDING_PROVIDER", "openrouter");
    setEnv("DEFAULT_EMBEDDING_MODEL", "nvidia/nemotron-3-embed-1b:free");
    const cfg = defaultModelConfig("embedding");
    expect(cfg.primaryProvider).toBe("openrouter");
    expect(cfg.primaryModel).toBe("nvidia/nemotron-3-embed-1b:free");
    expect(cfg.fallbackProvider).toBe("openrouter");
    expect(cfg.fallbackModel).toBe("nvidia/nemotron-3-embed-1b:free");
  });

  it("embedding purpose falls back to mock only in demo mode", () => {
    setEnv("DEFAULT_EMBEDDING_PROVIDER", "mock");
    setEnv("DEFAULT_EMBEDDING_MODEL", "autoai-demo-1");
    const cfg = defaultModelConfig("embedding");
    expect(cfg.fallbackProvider).toBe("mock");
  });
});
