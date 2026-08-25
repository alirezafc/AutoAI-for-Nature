import { getAiConnections } from "@/lib/services/ai-connections";

/**
 * Live OpenRouter model catalog.
 *
 * The API key NEVER leaves the server: it is resolved from the stored DB
 * connection or the environment, used only in the Authorization header of the
 * outbound call, never returned, never logged. The browser only ever talks to
 * our authenticated admin API and receives sanitized metadata.
 */

export interface CatalogModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number | null;
  free: boolean;
  /** USD per million tokens; null when unknown/unmetered. */
  pricing: {
    promptPerMillion: number | null;
    completionPerMillion: number | null;
  };
  supportedParameters: string[];
  /** Native structured outputs (`response_format: json_schema`) support. */
  supportsStructuredOutputs: boolean;
  modality?: string | null;
}

export interface ModelCatalog {
  provider: "openrouter";
  fetchedAt: string;
  count: number;
  models: CatalogModel[];
}

interface OpenRouterModelEntry {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: { modality?: string };
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
}

const CATALOG_TTL_MS = 5 * 60_000;

// Process-wide cache (Next.js dev can duplicate modules per route bundle).
const globalStore = globalThis as {
  __autoaiOpenRouterCatalog?: { at: number; catalog: ModelCatalog } | null;
};

function pricePerMillion(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000 * 1e4) / 1e4;
}

function sanitize(entry: OpenRouterModelEntry): CatalogModel | null {
  if (!entry.id) return null;
  const promptPerMillion = pricePerMillion(entry.pricing?.prompt);
  const completionPerMillion = pricePerMillion(entry.pricing?.completion);
  const free =
    entry.id.endsWith(":free") ||
    (promptPerMillion === 0 && completionPerMillion === 0);
  const params = Array.isArray(entry.supported_parameters)
    ? entry.supported_parameters.filter((p): p is string => typeof p === "string")
    : [];
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    description: entry.description ? entry.description.slice(0, 300) : undefined,
    contextLength: typeof entry.context_length === "number" ? entry.context_length : null,
    free,
    pricing: {
      promptPerMillion: free ? 0 : promptPerMillion,
      completionPerMillion: free ? 0 : completionPerMillion,
    },
    supportedParameters: params,
    supportsStructuredOutputs:
      params.includes("structured_outputs") || params.includes("response_format"),
    modality: entry.architecture?.modality ?? null,
  };
}

async function resolveApiKey(): Promise<string> {
  const cfg = await getAiConnections();
  const stored = cfg.keys.OPENROUTER_API_KEY?.trim();
  const env = process.env.OPENROUTER_API_KEY?.trim();
  // Stored DB key wins (it is what Save & Test validated); env is the fallback
  // so a Vercel-only deployment works without any DB configuration.
  const key = stored || env || "";
  if (!key) throw new Error("No OpenRouter credential configured (env OPENROUTER_API_KEY or Admin → Settings → AI Connections).");
  return key;
}

/**
 * Fetch the live catalog through the server-side OpenRouter endpoint.
 * Cached for CATALOG_TTL_MS; `refresh` forces a fresh fetch.
 */
export async function fetchOpenRouterModelCatalog(
  opts: { refresh?: boolean } = {}
): Promise<ModelCatalog> {
  const cached = globalStore.__autoaiOpenRouterCatalog;
  if (!opts.refresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) {
    return cached.catalog;
  }

  const baseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const key = await resolveApiKey();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`OpenRouter catalog unreachable: ${err instanceof Error ? err.message : "network error"}`);
  }
  if (!res.ok) {
    // Status only — never echo request headers or credentials.
    throw new Error(`OpenRouter catalog request failed (HTTP ${res.status})`);
  }
  const data = (await res.json().catch(() => null)) as { data?: OpenRouterModelEntry[] } | null;
  const entries = data?.data ?? [];

  const models = entries
    .map(sanitize)
    .filter((m): m is CatalogModel => m !== null)
    // Structured-output-capable models first, then alphabetical by id.
    .sort((a, b) => {
      if (a.supportsStructuredOutputs !== b.supportsStructuredOutputs) {
        return a.supportsStructuredOutputs ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    });

  const catalog: ModelCatalog = {
    provider: "openrouter",
    fetchedAt: new Date().toISOString(),
    count: models.length,
    models,
  };
  globalStore.__autoaiOpenRouterCatalog = { at: Date.now(), catalog };
  return catalog;
}
