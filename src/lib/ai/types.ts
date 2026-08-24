export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  free: boolean;
  description?: string;
  contextWindow?: number;
  supportsJson?: boolean;
  supportsStreaming?: boolean;
  supportsEmbeddings?: boolean;
  /** Sentinel model that is resolved to a real model id at request time. */
  autoResolve?: boolean;
}

export interface GenerateTextParams {
  provider: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  jsonSchema?: unknown;
  signal?: AbortSignal;
  runId?: string;
  purpose?: string;
}

export interface StreamEvent {
  type: "chunk";
  text: string;
}

export interface GenerateTextResponse {
  text: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  raw?: unknown;
}

export interface EmbeddingParams {
  provider: string;
  model: string;
  text: string;
  runId?: string;
  signal?: AbortSignal;
}

export interface EmbeddingResponse {
  embedding: number[];
  latencyMs: number;
  dimensions: number;
  provider: string;
  model: string;
  tokens?: number;
}

export interface AIProvider {
  key: string;
  name: string;
  kind: "chat" | "embedding" | "both";
  isConfigured(): boolean;
  getApiKeyEnv(): string | undefined;
  generateText(params: GenerateTextParams): Promise<GenerateTextResponse>;
  streamText(
    params: GenerateTextParams,
    onChunk: (chunk: string) => void
  ): Promise<GenerateTextResponse>;
  generateEmbedding?(params: EmbeddingParams): Promise<EmbeddingResponse>;
  models(): ModelInfo[];
}

export interface AttemptInfo {
  provider: string;
  model: string;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export interface RouterResult<T> {
  value: T;
  provider: string;
  model: string;
  latencyMs: number;
  attempts: AttemptInfo[];
  fallbackUsed: boolean;
  tokensIn?: number;
  tokensOut?: number;
}

export type ModelPurpose =
  | "chatbot"
  | "researcher"
  | "strategist"
  | "writer"
  | "critic"
  | "seo"
  | "publisher"
  | "final_critic"
  | "idea"
  | "voice"
  | "lessons"
  | "embedding";

export interface ModelPurposeConfig {
  purpose: ModelPurpose;
  label: string;
  primaryProvider: string;
  primaryModel: string;
  fallbackProvider: string;
  fallbackModel: string;
  temperature?: number;
  maxTokens?: number;
  ragEnabled?: boolean;
}

export interface ModelConfigStore {
  getPurposeConfig(purpose: ModelPurpose): Promise<ModelPurposeConfig | undefined>;
}
