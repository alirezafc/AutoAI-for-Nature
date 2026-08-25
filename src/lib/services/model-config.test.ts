import { describe, expect, it } from "vitest";
import { resolveEffectivePurposeConfig, type PurposeConfigRowLike } from "./model-config";
import type { ModelPurpose } from "@/lib/ai/types";

const row = (over: Partial<PurposeConfigRowLike> = {}): PurposeConfigRowLike => ({
  primaryProvider: "mock",
  primaryModel: "autoai-demo-1",
  fallbackProvider: "mock",
  fallbackModel: "autoai-demo-1",
  temperature: 70,
  maxTokens: 2048,
  ragEnabled: false,
  ...over,
});

const deps = {
  purpose: "strategist" as ModelPurpose,
  providerConfigured: (key: string) => key === "openrouter",
};

describe("resolveEffectivePurposeConfig precedence", () => {
  it("PRODUCTION CASE: stale mock rows + real AI Connections default -> openrouter/gpt-4o-mini", () => {
    const cfg = resolveEffectivePurposeConfig({
      ...deps,
      row: row(),
      connectionDefault: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    });
    expect(cfg.primaryProvider).toBe("openrouter");
    expect(cfg.primaryModel).toBe("openai/gpt-4o-mini");
    expect(cfg.fallbackProvider).toBe("openrouter");
    // per-purpose tuning preserved from defaults
    expect(cfg.maxTokens).toBe(1536);
  });

  it("BOOTSTRAP: no default anywhere + OpenRouter credential -> mandated production pair", () => {
    const cfg = resolveEffectivePurposeConfig({
      ...deps,
      row: null,
      connectionDefault: { provider: "mock", model: "autoai-demo-1" },
    });
    expect(cfg.primaryProvider).toBe("openrouter");
    expect(cfg.primaryModel).toBe("openai/gpt-4o-mini");
  });

  it("BOOTSTRAP does not fire without a configured credential (demo mode stays mock)", () => {
    const cfg = resolveEffectivePurposeConfig({
      purpose: "strategist",
      row: null,
      connectionDefault: { provider: "mock", model: "autoai-demo-1" },
      providerConfigured: () => false,
    });
    expect(cfg.primaryProvider).toBe("mock");
    expect(cfg.primaryModel).toBe("autoai-demo-1");
  });

  it("explicit real override row wins over the connections default", () => {
    const cfg = resolveEffectivePurposeConfig({
      ...deps,
      row: row({ primaryProvider: "openai", primaryModel: "gpt-4o", fallbackProvider: "openrouter", fallbackModel: "openai/gpt-4o-mini" }),
      connectionDefault: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    });
    expect(cfg.primaryProvider).toBe("openai");
    expect(cfg.primaryModel).toBe("gpt-4o");
    expect(cfg.fallbackProvider).toBe("openrouter");
    expect(cfg.maxTokens).toBe(2048); // row tuning honored
  });

  it("real override with stale MOCK fallback gets a safe mirrored fallback (guard must pass)", () => {
    const cfg = resolveEffectivePurposeConfig({
      ...deps,
      row: row({ primaryProvider: "openrouter", primaryModel: "openai/gpt-4o-mini" }),
      connectionDefault: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    });
    expect(cfg.primaryProvider).toBe("openrouter");
    expect(cfg.fallbackProvider).toBe("openrouter");
    expect(cfg.fallbackModel).toBe("openai/gpt-4o-mini");
  });

  it("demo mode without credentials preserves legacy mock row behavior", () => {
    const cfg = resolveEffectivePurposeConfig({
      purpose: "strategist",
      row: row({ temperature: 42 }),
      connectionDefault: { provider: "mock", model: "autoai-demo-1" },
      providerConfigured: () => false,
    });
    expect(cfg.primaryProvider).toBe("mock");
    expect(cfg.temperature).toBe(42);
  });

  it("embedding purposes resolve through the embedding connection default", () => {
    const cfg = resolveEffectivePurposeConfig({
      purpose: "embedding",
      row: null,
      connectionDefault: { provider: "openrouter", model: "nvidia/nemotron-3-embed-1b:free" },
      providerConfigured: () => true,
    });
    expect(cfg.primaryProvider).toBe("openrouter");
    expect(cfg.primaryModel).toBe("nvidia/nemotron-3-embed-1b:free");
  });

  it("DB read failure still resolves via connections default (never resurrects mock)", () => {
    const cfg = resolveEffectivePurposeConfig({
      ...deps,
      row: null,
      connectionDefault: { provider: "openrouter", model: "openai/gpt-4o-mini" },
    });
    expect(cfg.primaryProvider).toBe("openrouter");
    expect(cfg.primaryModel).toBe("openai/gpt-4o-mini");
  });
});
