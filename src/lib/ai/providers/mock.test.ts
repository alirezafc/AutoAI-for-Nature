import { describe, expect, it } from "vitest";
import { MockProvider } from "./mock";
import { EMBEDDING_DIMENSIONS } from "@/db/schema/common";

const provider = new MockProvider();

function promptWithSchema(topic: string, schema: Record<string, null>): string {
  return `Topic: ${topic}\nLanguage: en\n\n[SCHEMA]\n${JSON.stringify(schema)}\n[/SCHEMA]`;
}

describe("MockProvider", () => {
  it("is configured without an API key", () => {
    expect(provider.isConfigured()).toBe(true);
    expect(provider.getApiKeyEnv()).toBeUndefined();
    expect(provider.models().length).toBe(1);
    expect(provider.models()[0].free).toBe(true);
  });

  it("is deterministic for the same prompt", async () => {
    const p = promptWithSchema("Coral reefs", { angle: null, audience: null });
    const a = await provider.generateText({ provider: "mock", model: "autoai-demo-1", messages: [{ role: "user", content: p }] });
    const b = await provider.generateText({ provider: "mock", model: "autoai-demo-1", messages: [{ role: "user", content: p }] });
    expect(a.text).toBe(b.text);
  });

  it("emits valid JSON for a schema hint with null values filled", async () => {
    const res = await provider.generateText({
      provider: "mock",
      model: "autoai-demo-1",
      messages: [
        {
          role: "user",
          content: promptWithSchema("Coral reefs", {
            angle: null,
            audience: null,
            tone: null,
            keyPoints: null,
            outline: null,
          }),
        },
      ],
    });
    const parsed = JSON.parse(res.text) as Record<string, unknown>;
    expect(parsed.angle).toBeTruthy();
    expect(parsed.audience).toBeTruthy();
    expect(parsed.tone).toBeTruthy();
    expect(Array.isArray(parsed.keyPoints)).toBe(true);
    expect(Array.isArray(parsed.outline)).toBe(true);
  });

  it("extracts the topic despite a leading system message and appended schema block", async () => {
    const schemaJson = JSON.stringify({ title: null, excerpt: null, content: null });
    const user =
      [
        "Title: How do mangroves protect coastlines? — idea 1",
        "Language: en",
        "[ROUND: 1]",
        "Strategy:\nAngle: x\nOutline:\n- b",
        "",
      ].filter(Boolean).join("\n") +
      `\n\nReturn a single JSON object that matches the schema below. Output only JSON.\n\nJSON_SCHEMA:\n${schemaJson}\n\n[SCHEMA]\n${schemaJson}\n[/SCHEMA]`;

    const res = await provider.generateText({
      provider: "mock",
      model: "autoai-demo-1",
      messages: [
        { role: "system", content: "You are the writer agent in the AutoAI editorial newsroom about nature, wildlife and the environment." },
        { role: "user", content: user },
      ],
    });
    const parsed = JSON.parse(res.text) as { title: string };
    expect(parsed.title).toBe("The story of How do mangroves protect coastlines? — idea 1");
    expect(parsed.title).not.toMatch(/SCHEMA/);
  });

  it("returns bilingual content", async () => {
    const en = await provider.generateText({
      provider: "mock",
      model: "autoai-demo-1",
      messages: [{ role: "user", content: "Topic: nature\nLanguage: en" }],
    });
    const fa = await provider.generateText({
      provider: "mock",
      model: "autoai-demo-1",
      messages: [{ role: "user", content: "Topic: طبیعت\nLanguage: fa" }],
    });
    expect(en.text).toMatch(/The story of nature/);
    expect(fa.text).toMatch(/گزارش:/);
  });

  it("generates unit-normalized embeddings at the canonical dimension", async () => {
    const res = await provider.generateEmbedding({ provider: "mock", model: "autoai-demo-1", text: "hello world" });
    expect(res.embedding.length).toBe(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(res.embedding.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
    expect(res.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("streams text in chunks and matches the full output", async () => {
    const chunks: string[] = [];
    const res = await provider.streamText(
      { provider: "mock", model: "autoai-demo-1", messages: [{ role: "user", content: "Topic: forests\nLanguage: en" }] },
      (c) => chunks.push(c)
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(res.text);
  });

  it("grounds chat answers in the retrieved RAG sources instead of canned text", async () => {
    const ragContext = [
      "[Source 1] Mangrove Forests Protect Coastlines",
      "Mangrove forests are coastal ecosystems that protect shorelines from erosion, storms and flooding. They act as nurseries for fish and shellfish and store large amounts of carbon. Despite their importance, mangroves are being lost at alarming rates due to coastal development and aquaculture.",
      "",
      "---",
      "",
      "[Source 2] Wetlands in Flood Protection",
      "Wetlands absorb floodwaters, slow river flows and recharge groundwater. They are vital for water purification and biodiversity.",
    ].join("\n");

    const res = await provider.generateText({
      provider: "mock",
      model: "autoai-demo-1",
      messages: [
        { role: "system", content: "You are the intelligent assistant for AutoAI for Nature." },
        {
          role: "system",
          content: `Relevant knowledge sources (use these to ground your answer):\n\n${ragContext}`,
        },
        { role: "user", content: "How do mangroves protect coastlines?" },
      ],
    });

    expect(res.text).toContain("Mangrove Forests Protect Coastlines");
    expect(res.text.toLowerCase()).toContain("erosion");
    expect(res.text).not.toMatch(/specialized nature assistant/i);
  });
});
