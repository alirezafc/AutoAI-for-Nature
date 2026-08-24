import type { ModelPurpose, ModelPurposeConfig } from "./types";

const envProvider = () => process.env.DEFAULT_AI_PROVIDER || "mock";
const envModel = () => process.env.DEFAULT_AI_MODEL || "autoai-demo-1";

export function defaultModelConfig(purpose: ModelPurpose): ModelPurposeConfig {
  const provider = envProvider();
  const model = envModel();
  const isMock = provider === "mock";
  // The fallback is only ever the demo provider when the primary IS the demo
  // provider. With a real provider configured, the fallback mirrors the
  // primary (deduplicated in the router), so the mock is never silently used
  // on the "real AI" path.
  const fallback = isMock ? { fallbackProvider: "mock", fallbackModel: "autoai-demo-1" } : { fallbackProvider: provider, fallbackModel: model };
  const base = {
    primaryProvider: provider,
    primaryModel: model,
    ...fallback,
    temperature: 70,
    maxTokens: 2048,
  };
  switch (purpose) {
    case "chatbot":
      return { ...base, purpose, label: "Chatbot", maxTokens: 1024, ragEnabled: true };
    case "voice":
      return { ...base, purpose, label: "Voice LLM", maxTokens: 1024, ragEnabled: true };
    case "idea":
      return { ...base, purpose, label: "Idea Scout", maxTokens: 1024 };
    case "strategist":
      return { ...base, purpose, label: "Strategist", maxTokens: 1536 };
    case "researcher":
      return { ...base, purpose, label: "Researcher", maxTokens: 3072 };
    case "writer":
      return { ...base, purpose, label: "Writer", maxTokens: 4096 };
    case "critic":
      return { ...base, purpose, label: "Critic", temperature: 30, maxTokens: 2048 };
    case "seo":
      return { ...base, purpose, label: "SEO", maxTokens: 1536 };
    case "publisher":
      return { ...base, purpose, label: "Publisher", temperature: 30, maxTokens: 512 };
    case "final_critic":
      return { ...base, purpose, label: "Final Critic", temperature: 30, maxTokens: 2048 };
    case "lessons":
      return { ...base, purpose, label: "Lessons", temperature: 30, maxTokens: 1024 };
    case "embedding": {
      const embProvider = process.env.DEFAULT_EMBEDDING_PROVIDER || "mock";
      const embModel = process.env.DEFAULT_EMBEDDING_MODEL || "autoai-demo-1";
      const embFallback = embProvider === "mock"
        ? { fallbackProvider: "mock", fallbackModel: "autoai-demo-1" }
        : { fallbackProvider: embProvider, fallbackModel: embModel };
      return {
        purpose,
        label: "Embeddings",
        primaryProvider: embProvider,
        primaryModel: embModel,
        ...embFallback,
        temperature: 0,
        maxTokens: 0,
      };
    }
  }
}
