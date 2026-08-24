import { OpenAiCompatibleProvider } from "./openai-compatible";
import type { EmbeddingParams, EmbeddingResponse, ModelInfo } from "../types";

const EMBED_MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-004": 768,
  "gemini-embedding-001": 3072,
};

export class GeminiProvider extends OpenAiCompatibleProvider {
  override async generateEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const { ProviderError, PROVIDER_ERROR_CODES } = await import("../errors");
    const key = process.env[this.getApiKeyEnv() ?? ""];
    if (!key) {
      throw new ProviderError(PROVIDER_ERROR_CODES.NOT_CONFIGURED, "Gemini is not configured");
    }
    const started = Date.now();
    const model = params.model;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text: params.text }] },
        }),
        signal: params.signal,
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(
        res.status === 429 ? PROVIDER_ERROR_CODES.RATE_LIMITED : PROVIDER_ERROR_CODES.API_FAILURE,
        body.slice(0, 300) || `Gemini embedding failed (${res.status})`,
        res.status
      );
    }
    const data = (await res.json()) as { embedding?: { values?: number[] } };
    const values = data.embedding?.values ?? [];
    if (!values.length) {
      throw new ProviderError(PROVIDER_ERROR_CODES.INVALID_RESPONSE, "Empty Gemini embedding");
    }
    return {
      embedding: values,
      latencyMs: Date.now() - started,
      dimensions: EMBED_MODEL_DIMENSIONS[model] ?? values.length,
      provider: this.key,
      model,
    };
  }

  static geminiModels(): ModelInfo[] {
    return [
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "google",
        free: true,
        description: "Fast multimodal model with a generous free tier.",
        supportsJson: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
      },
      {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        provider: "google",
        free: true,
        description: "Lightweight and free-tier friendly.",
        supportsJson: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
      },
      {
        id: "gemini-2.5-pro-exp-03-25",
        name: "Gemini 2.5 Pro (experimental)",
        provider: "google",
        free: false,
        description: "Deep reasoning for complex research tasks.",
        supportsJson: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
      },
      {
        id: "text-embedding-004",
        name: "text-embedding-004",
        provider: "google",
        free: true,
        description: "Gemini free-tier embedding model (768 dims).",
        supportsEmbeddings: true,
      },
    ];
  }
}
