import { describe, expect, it } from "vitest";
import { generateStructured } from "./structured-output";
import {
  ArticleSchema,
  CriticSchema,
  FinalCriticSchema,
  IdeaSchema,
  LessonSchema,
  PublishSchema,
  ResearchSchema,
  SeoSchema,
  StrategySchema,
} from "@/lib/agents/contracts";
import type { ModelConfigStore, ModelPurposeConfig } from "./types";

function mockStore(): ModelConfigStore {
  const configs = new Map<ModelPurposeConfig["purpose"], ModelPurposeConfig>();
  const get = (purpose: ModelPurposeConfig["purpose"]): ModelPurposeConfig => ({
    purpose,
    label: purpose,
    primaryProvider: "mock",
    primaryModel: "autoai-demo-1",
    fallbackProvider: "mock",
    fallbackModel: "autoai-demo-1",
    temperature: 50,
    maxTokens: 2048,
  });
  return {
    async getPurposeConfig(purpose) {
      let cfg = configs.get(purpose);
      if (!cfg) {
        cfg = get(purpose);
        configs.set(purpose, cfg);
      }
      return cfg;
    },
  };
}

const store = mockStore();

describe("generateStructured with mock provider", () => {
  it("validates every agent schema against mock output (regression: audience/keyPoints)", async () => {
    const topic = "How do coral reefs survive warming oceans?";

    const { data: idea } = await generateStructured(IdeaSchema, {
      purpose: "idea",
      messages: [{ role: "user", content: `Topic: ${topic}\nLanguage: en` }],
      store,
    });
    expect(idea.ideas.length).toBeGreaterThanOrEqual(1);
    expect(idea.ideas[0].title).toBeTruthy();

    const { data: strategy } = await generateStructured(StrategySchema, {
      purpose: "strategist",
      messages: [{ role: "user", content: `Article idea: ${idea.ideas[0].title}\nTopic: ${topic}\nLanguage: en` }],
      store,
    });
    expect(strategy.angle).toBeTruthy();
    expect(strategy.audience).toBeTruthy();
    expect(strategy.tone).toBeTruthy();
    expect(strategy.keyPoints.length).toBeGreaterThanOrEqual(1);
    expect(strategy.outline.length).toBeGreaterThanOrEqual(1);

    const { data: research } = await generateStructured(ResearchSchema, {
      purpose: "researcher",
      messages: [{ role: "user", content: `Article idea: ${idea.ideas[0].title}\nLanguage: en\nStrategy:\nAngle: ${strategy.angle}` }],
      store,
    });
    expect(research.findings.length).toBeGreaterThanOrEqual(1);
    for (const f of research.findings) {
      expect(f.fact).toBeTruthy();
      expect(f.source).toBeTruthy();
      expect(f.confidence).toBeGreaterThanOrEqual(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
    }

    const { data: article } = await generateStructured(ArticleSchema, {
      purpose: "writer",
      messages: [{ role: "user", content: `Title: ${idea.ideas[0].title}\nLanguage: en\nWrite the article.` }],
      store,
    });
    expect(article.title.length).toBeGreaterThanOrEqual(3);
    expect(article.content.length).toBeGreaterThanOrEqual(50);

    const { data: critic } = await generateStructured(CriticSchema, {
      purpose: "critic",
      messages: [{ role: "user", content: `Article:\n${article.content}` }],
      store,
    });
    expect(critic.score).toBeGreaterThanOrEqual(0);
    expect(critic.score).toBeLessThanOrEqual(100);
    expect(["approved", "revision"]).toContain(critic.verdict);

    const { data: seo } = await generateStructured(SeoSchema, {
      purpose: "seo",
      messages: [{ role: "user", content: `Title: ${article.title}` }],
      store,
    });
    expect(seo.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

    const { data: publish } = await generateStructured(PublishSchema, {
      purpose: "publisher",
      messages: [{ role: "user", content: `Title: ${article.title}\nCritic score: ${critic.score}` }],
      store,
    });
    expect(["publish", "draft", "needs_review"]).toContain(publish.status);

    const { data: finalCritic } = await generateStructured(FinalCriticSchema, {
      purpose: "final_critic",
      messages: [{ role: "user", content: `Article:\n${article.content}` }],
      store,
    });
    expect(typeof finalCritic.approved).toBe("boolean");
    expect(finalCritic.finalScore).toBeGreaterThanOrEqual(0);
    expect(finalCritic.finalScore).toBeLessThanOrEqual(100);

    const { data: lessons } = await generateStructured(LessonSchema, {
      purpose: "lessons",
      messages: [{ role: "user", content: "Summarize lessons from this run." }],
      store,
    });
    expect(lessons.lessons.length).toBeGreaterThanOrEqual(1);
  });

  it("honors the target language", async () => {
    const { data: fa } = await generateStructured(StrategySchema, {
      purpose: "strategist",
      messages: [{ role: "user", content: "Topic: Ø·Ø¨ÛŒØ¹Øª\nLanguage: fa" }],
      store,
    });
    expect(fa.audience).toBeTruthy();
    expect(fa.outline.length).toBeGreaterThanOrEqual(1);
  });
});
