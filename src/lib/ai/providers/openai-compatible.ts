import type {
  AIProvider,
  ChatMessage,
  EmbeddingParams,
  EmbeddingResponse,
  GenerateTextParams,
  GenerateTextResponse,
  ModelInfo,
  StreamEvent,
} from "../types";

export interface OpenAiCompatibleConfig {
  key: string;
  name: string;
  apiKeyEnv: string;
  baseUrl: string;
  models: ModelInfo[];
  defaultEmbeddingModel?: string;
}

/**
 * Shape produced by lib/ai/structured-output.ts: a JSON Schema derived from the
 * application's Zod contract plus whether it is safe for `strict` mode.
 */
interface StructuredOutputSchema {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

function asStructuredOutputSchema(jsonSchema: unknown): StructuredOutputSchema | null {
  if (!jsonSchema || typeof jsonSchema !== "object" || Array.isArray(jsonSchema)) return null;
  const candidate = jsonSchema as { name?: unknown; strict?: unknown; schema?: unknown };
  if (
    typeof candidate.name === "string" &&
    typeof candidate.strict === "boolean" &&
    candidate.schema &&
    typeof candidate.schema === "object"
  ) {
    return { name: candidate.name, strict: candidate.strict, schema: candidate.schema as Record<string, unknown> };
  }
  return null;
}

export class OpenAiCompatibleProvider implements AIProvider {
  key: string;
  name: string;
  kind = "both" as const;
  private apiKeyEnv: string;
  private baseUrl: string;
  private modelList: ModelInfo[];
  private defaultEmbeddingModel?: string;

  constructor(config: OpenAiCompatibleConfig) {
    this.key = config.key;
    this.name = config.name;
    this.apiKeyEnv = config.apiKeyEnv;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.modelList = config.models;
    this.defaultEmbeddingModel = config.defaultEmbeddingModel;
  }

  isConfigured(): boolean {
    return Boolean(process.env[this.apiKeyEnv]);
  }

  getApiKeyEnv(): string | undefined {
    return this.apiKeyEnv;
  }

  models(): ModelInfo[] {
    return this.modelList;
  }

  private autoModelCache: { at: number; ids: string[] } = { at: 0, ids: [] };

  private async listModelIds(): Promise<string[]> {
    const now = Date.now();
    if (this.autoModelCache.ids.length > 0 && now - this.autoModelCache.at < 5 * 60_000) {
      return this.autoModelCache.ids;
    }
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res || !res.ok) {
      this.autoModelCache = { at: now, ids: [] };
      return [];
    }
    const data = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
    const ids = (data?.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    this.autoModelCache = { at: now, ids };
    return ids;
  }

  private preferredFreeId(ids: string[]): string | undefined {
    const preferred = [
      "deepseek/deepseek-chat-v3-0324:free",
      "google/gemini-2.0-flash-exp:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemini-2.5-flash-lite:free",
    ];
    for (const p of preferred) if (ids.includes(p)) return p;
    return ids.find((id) => id.endsWith(":free"));
  }

  /**
   * `openrouter/free` is a sentinel that resolves to an actually-available
   * `:free` model at request time (dynamic catalog). `openrouter/auto` is
   * passed through natively — OpenRouter resolves it to a capable model.
   */
  private async resolveChatModel(model: string): Promise<string> {
    if (model !== "openrouter/free") return model;
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    const ids = await this.listModelIds();
    const chosen = this.preferredFreeId(ids);
    if (!chosen) {
      throw new ProviderError(
        PROVIDER_ERROR_CODES.NOT_CONFIGURED,
        "OpenRouter: no :free models are currently available via /models"
      );
    }
    return chosen;
  }

  private chatEndpoint(): string {
    return `${this.baseUrl}/chat/completions`;
  }

  private embeddingEndpoint(): string {
    return `${this.baseUrl}/embeddings`;
  }

  private headers(): Record<string, string> {
    const key = process.env[this.apiKeyEnv];
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    };
  }

  private async parseError(res: Response, fallback: string): Promise<never> {
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    const message = body.length > 300 ? body.slice(0, 300) : body || fallback;
    const lower = (body || "").toLowerCase();
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(PROVIDER_ERROR_CODES.AUTH_FAILURE, `Auth failed (${res.status})`, res.status);
    }
    if (res.status === 429) {
      throw new ProviderError(PROVIDER_ERROR_CODES.RATE_LIMITED, "Rate limited (429)", res.status);
    }
    if (res.status === 408 || res.status === 504) {
      throw new ProviderError(PROVIDER_ERROR_CODES.TIMEOUT, "Request timed out", res.status);
    }
    const needsRetryNoJson =
      res.status === 400 &&
      (lower.includes("response_format") ||
        lower.includes("json_object") ||
        lower.includes("json_schema") ||
        lower.includes("structured output") ||
        lower.includes("not supported"));
    if (needsRetryNoJson) {
      throw new ProviderError("retry_no_json", message, res.status);
    }
    throw new ProviderError(PROVIDER_ERROR_CODES.API_FAILURE, message, res.status);
  }

  async generateText(params: GenerateTextParams): Promise<GenerateTextResponse> {
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    if (!this.isConfigured()) {
      throw new ProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, `${this.name} is not configured (${this.apiKeyEnv})`);
    }
    const started = Date.now();
    const model = await this.resolveChatModel(params.model);
    // Native structured output: the schema is the exact object derived from the
    // application's Zod contract (see lib/ai/json-schema.ts), so provider-side
    // enforcement and local validation can never disagree.
    const structured = asStructuredOutputSchema(params.jsonSchema);
    const responseFormatFor = (mode: "schema" | "object" | "none"): Record<string, unknown> | undefined => {
      if (mode === "schema" && structured) {
        return {
          type: "json_schema",
          json_schema: { name: structured.name, strict: structured.strict, schema: structured.schema },
        };
      }
      if (mode === "object" && params.json) return { type: "json_object" };
      return undefined;
    };

    const post = async (responseFormat?: Record<string, unknown>): Promise<Response> => {
      const body: Record<string, unknown> = {
        model,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: (params.temperature ?? 0.7) / 100,
        max_tokens: params.maxTokens ?? 2048,
        stream: false,
      };
      if (responseFormat) body.response_format = responseFormat;
      return fetch(this.chatEndpoint(), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: params.signal,
      });
    };
    const formatRejected = async (res: Response): Promise<boolean> => {
      if (res.status !== 400) return false;
      const text = await res.clone().text().catch(() => "");
      const lower = text.toLowerCase();
      return (
        lower.includes("response_format") ||
        lower.includes("json_schema") ||
        lower.includes("json_object") ||
        lower.includes("structured output")
      );
    };

    let res: Response;
    if (params.json) {
      // Attempt tier: json_schema -> json_object -> no response_format.
      res = await post(responseFormatFor(structured ? "schema" : "object"));
      if (!(await formatRejected(res))) {
        if (!res.ok) await this.parseError(res, `HTTP ${res.status}`);
      } else {
        res = await post(responseFormatFor("object"));
        if (await formatRejected(res)) {
          res = await post(undefined);
          if (!res.ok) await this.parseError(res, `HTTP ${res.status}`);
        } else if (!res.ok) {
          await this.parseError(res, `HTTP ${res.status}`);
        }
      }
    } else {
      res = await post(undefined);
      if (!res.ok) {
        await this.parseError(res, `HTTP ${res.status}`);
      }
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (data.error) {
      throw new ProviderError(PROVIDER_ERROR_CODES.API_FAILURE, data.error.message ?? "API error");
    }

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new ProviderError(PROVIDER_ERROR_CODES.INVALID_RESPONSE, "Empty response from provider");
    }
    return {
      text,
      latencyMs: Date.now() - started,
      tokensIn: data.usage?.prompt_tokens,
      tokensOut: data.usage?.completion_tokens,
      raw: data,
    };
  }

  async streamText(
    params: GenerateTextParams,
    onChunk: (chunk: string) => void
  ): Promise<GenerateTextResponse> {
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    if (!this.isConfigured()) {
      throw new ProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, `${this.name} is not configured`);
    }
    const started = Date.now();
    const model = await this.resolveChatModel(params.model);
    const body: Record<string, unknown> = {
      model,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: (params.temperature ?? 0.7) / 100,
      max_tokens: params.maxTokens ?? 2048,
      stream: true,
    };
    if (params.json) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(this.chatEndpoint(), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: params.signal,
    });
    if (!res.ok) {
      await this.parseError(res, `HTTP ${res.status}`);
    }
    if (!res.body) {
      throw new ProviderError(PROVIDER_ERROR_CODES.INVALID_RESPONSE, "No stream body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string }; finish_reason?: string }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = parsed.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            onChunk(delta);
          }
          if (parsed.usage) {
            tokensIn = parsed.usage.prompt_tokens;
            tokensOut = parsed.usage.completion_tokens;
          }
        } catch {
          // ignore partial parse
        }
      }
    }

    if (!full) {
      throw new ProviderError(PROVIDER_ERROR_CODES.INVALID_RESPONSE, "Empty streamed response");
    }
    return {
      text: full,
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
    };
  }

  async generateEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    if (!this.isConfigured()) {
      throw new ProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, `${this.name} is not configured`);
    }
    const started = Date.now();
    const res = await fetch(this.embeddingEndpoint(), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: params.model,
        input: params.text,
      }),
      signal: params.signal,
    });
    if (!res.ok) {
      await this.parseError(res, `HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      data?: { embedding?: number[] }[];
      usage?: { total_tokens?: number };
      error?: { message?: string };
    };
    if (data.error) {
      throw new ProviderError(PROVIDER_ERROR_CODES.API_FAILURE, data.error.message ?? "Embedding error");
    }
    const embedding = data.data?.[0]?.embedding ?? [];
    if (!embedding.length) {
      throw new ProviderError(PROVIDER_ERROR_CODES.INVALID_RESPONSE, "Empty embedding response");
    }
    return {
      embedding,
      latencyMs: Date.now() - started,
      dimensions: embedding.length,
      provider: this.key,
      model: params.model,
      tokens: data.usage?.total_tokens,
    };
  }
}
