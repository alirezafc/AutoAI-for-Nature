import type { ModelConfigStore, ModelPurpose } from "./types";
import { getProvider, MOCK_PROVIDER_KEY } from "./registry";

/**
 * Env flag that keeps the mock provider callable. It is set ONLY by the
 * automated test runner (vitest.config.ts). Any other process — dev server,
 * production build, scripts — must use a real provider.
 */
export const MOCK_ALLOWED_ENV = "AUTOAI_ALLOW_MOCK";

export function mockAllowedInProcess(): boolean {
  return process.env[MOCK_ALLOWED_ENV] === "1";
}

export const AI_CONNECTIONS_HINT =
  "Open Admin → Settings → AI Connections and connect a real AI provider (e.g. OpenRouter).";

/** Thrown before any fake generation can start when no real provider is ready. */
export class AiNotConfiguredError extends Error {
  readonly code = "ai_not_configured";
  constructor(detail?: string) {
    super(
      detail
        ? `AI is not configured for real generation: ${detail} ${AI_CONNECTIONS_HINT}`
        : `No real AI provider is configured. ${AI_CONNECTIONS_HINT}`
    );
    this.name = "AiNotConfiguredError";
  }
}

export function isAiNotConfiguredError(err: unknown): err is AiNotConfiguredError {
  return err instanceof AiNotConfiguredError;
}

function effectiveAttempts(cfg: {
  primaryProvider: string;
  primaryModel: string;
  fallbackProvider: string;
  fallbackModel: string;
}): { provider: string; model: string }[] {
  const list = [
    { provider: cfg.primaryProvider, model: cfg.primaryModel },
    { provider: cfg.fallbackProvider, model: cfg.fallbackModel },
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
 * Pre-flight guard for user-facing generation entry points (article runs,
 * regeneration, chatbot). For every purpose that would be exercised, the
 * PRIMARY attempt must be a real, configured provider and NO attempt may
 * point at the mock. Fails fast BEFORE any database rows are created so the
 * admin sees a clear configuration error instead of a silently-mocked run.
 *
 * An unconfigured FALLBACK is tolerated here — it is only reached if the
 * primary fails, and the router already reports that as a hard failure.
 */
export async function assertRealProviderReady(
  purposes: ModelPurpose[],
  store: ModelConfigStore
): Promise<void> {
  if (mockAllowedInProcess()) return;

  const problems: string[] = [];
  for (const purpose of purposes) {
    let cfg;
    try {
      cfg = await store.getPurposeConfig(purpose);
    } catch {
      problems.push(`${purpose}: model configuration unavailable`);
      continue;
    }
    if (!cfg) {
      problems.push(`${purpose}: no model configuration`);
      continue;
    }
    const attempts = effectiveAttempts(cfg);
    if (attempts.length === 0) {
      problems.push(`${purpose}: no provider configured`);
      continue;
    }
    if (attempts.some((a) => a.provider === MOCK_PROVIDER_KEY)) {
      problems.push(`${purpose}: still points at the mock provider`);
      continue;
    }
    const primary = attempts[0];
    const provider = getProvider(primary.provider);
    if (!provider) {
      problems.push(`${purpose}: unknown provider "${primary.provider}"`);
      continue;
    }
    if (!provider.isConfigured()) {
      const env = provider.getApiKeyEnv() ?? `${primary.provider.toUpperCase()}_API_KEY`;
      problems.push(`${purpose}: provider "${primary.provider}" has no API key (${env})`);
    }
  }

  if (problems.length > 0) {
    throw new AiNotConfiguredError(problems.join("; "));
  }
}
