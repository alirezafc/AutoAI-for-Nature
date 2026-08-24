import type {
  AIProvider,
  EmbeddingParams,
  EmbeddingResponse,
  GenerateTextParams,
  GenerateTextResponse,
  ModelInfo,
} from "../types";

export interface AnthropicConfig {
  key: string;
  name: string;
  apiKeyEnv: string;
  models: ModelInfo[];
}

const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements AIProvider {
  key: string;
  name: string;
  kind = "chat" as const;
  private apiKeyEnv: string;
  private modelList: ModelInfo[];

  constructor(config: AnthropicConfig) {
    this.key = config.key;
    this.name = config.name;
    this.apiKeyEnv = config.apiKeyEnv;
    this.modelList = config.models;
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

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": process.env[this.apiKeyEnv] ?? "",
      "anthropic-version": ANTHROPIC_VERSION,
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
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(PROVIDER_ERROR_CODES.AUTH_FAILURE, `Auth failed (${res.status})`, res.status);
    }
    if (res.status === 429) {
      throw new ProviderError(PROVIDER_ERROR_CODES.RATE_LIMITED, "Rate limited (429)", res.status);
    }
    if (res.status === 408 || res.status === 504) {
      throw new ProviderError(PROVIDER_ERROR_CODES.TIMEOUT, "Request timed out", res.status);
    }
    throw new ProviderError(PROVIDER_ERROR_CODES.API_FAILURE, message, res.status);
  }

  private buildBody(params: GenerateTextParams, stream: boolean): Record<string, unknown> {
    const system = params.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = params.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    return {
      model: params.model,
      messages: rest,
      ...(system ? { system } : {}),
      max_tokens: params.maxTokens ?? 2048,
      temperature: (params.temperature ?? 0.7) / 100,
      stream,
    };
  }

  async generateText(params: GenerateTextParams): Promise<GenerateTextResponse> {
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    if (!this.isConfigured()) {
      throw new ProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, `${this.name} is not configured (${this.apiKeyEnv})`);
    }
    const started = Date.now();
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(params, false)),
      signal: params.signal,
    });
    if (!res.ok) {
      await this.parseError(res, `HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (!text) {
      throw new ProviderError(PROVIDER_ERROR_CODES.INVALID_RESPONSE, "Empty response from Anthropic");
    }
    return {
      text,
      latencyMs: Date.now() - started,
      tokensIn: data.usage?.input_tokens,
      tokensOut: data.usage?.output_tokens,
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
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(params, true)),
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

    const flushLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (!payload) return;
      try {
        const parsed = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && parsed.delta.text) {
          full += parsed.delta.text;
          onChunk(parsed.delta.text);
        }
        if (parsed.usage) {
          tokensIn = parsed.usage.input_tokens;
          tokensOut = parsed.usage.output_tokens;
        }
      } catch {
        // ignore partial parse
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) flushLine(line);
    }
    flushLine(buffer);

    if (!full) {
      throw new ProviderError(PROVIDER_ERROR_CODES.INVALID_RESPONSE, "Empty streamed response from Anthropic");
    }
    return {
      text: full,
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
    };
  }

  async generateEmbedding(_params: EmbeddingParams): Promise<EmbeddingResponse> {
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    throw new ProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Anthropic does not offer embeddings");
  }
}
