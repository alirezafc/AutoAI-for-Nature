import { describe, expect, it, vi, afterEach } from "vitest";
import { generateStructured } from "./structured-output";
import { zodToJsonSchema } from "./json-schema";
import { StrategySchema, SeoSchema } from "@/lib/agents/contracts";
import type { ModelConfigStore, ModelPurposeConfig } from "./types";

/**
 * Regression tests for the REAL provider structured-output contract
 * (production failure: "Schema validation failed at \"outline.0\": Expected
 * string, received object" on openrouter/openai/gpt-4o-mini).
 *
 * These run against a stubbed HTTP layer so the exact wire format sent to the
 * provider is asserted — no mock AI provider involved on these paths.
 */

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key-for-vitest";

function openrouterStore(): ModelConfigStore {
  const cfg = (purpose: ModelPurposeConfig["purpose"]): ModelPurposeConfig => ({
    purpose,
    label: purpose,
    primaryProvider: "openrouter",
    primaryModel: "openai/gpt-4o-mini",
    fallbackProvider: "openrouter",
    fallbackModel: "openai/gpt-4o-mini",
    temperature: 70,
    maxTokens: 1536,
  });
  return {
    async getPurposeConfig(purpose) {
      return cfg(purpose);
    },
  };
}

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

/** Fake OpenAI-compatible endpoint serving queued payloads, capturing requests. */
function stubProviderResponses(payloads: { status?: number; content?: string; errorBody?: string }[]) {
  const requests: CapturedRequest[] = [];
  let call = 0;
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const queued = payloads[Math.min(call, payloads.length - 1)];
    call++;
    requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    if (queued.errorBody !== undefined) {
      return new Response(queued.errorBody, { status: queued.status ?? 400, headers: { "content-type": "application/json" } });
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: queued.content ?? "" } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    requests,
    callCount: () => call,
    restore: () => vi.unstubAllGlobals(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("structured output contract (regression: outline[0] as object)", () => {
  it("the Zod contract REJECTS the exact production failure shape", () => {
    const malformed = {
      angle: "How nightingales navigate",
      audience: "General readers",
      tone: "accessible",
      keyPoints: ["Magnetic field cues"],
      // EXACT shape observed in production:
      outline: [{ angle: "Navigation via magnetoreception", audience: "General readers" }],
    };
    const result = StrategySchema.safeParse(malformed);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.path).toEqual(["outline", 0]);
      expect(issue.message).toContain("Expected string, received object");
    }
  });

  it("derives ONE canonical JSON schema from the Zod contract enforcing string arrays", () => {
    const { schema, strictSafe } = zodToJsonSchema(StrategySchema);
    expect(strictSafe).toBe(true);
    const outline = schema.properties as { outline: { type: string; items: { type: string } } };
    expect(outline.outline.type).toBe("array");
    expect(outline.outline.items.type).toBe("string");
    expect(schema.required).toEqual(
      expect.arrayContaining(["angle", "audience", "tone", "keyPoints", "outline"])
    );
    expect(schema.additionalProperties).toBe(false);

    // Schemas containing record maps are not strict-safe (SeoSchema.structuredData).
    const seo = zodToJsonSchema(SeoSchema);
    expect(seo.strictSafe).toBe(false);
  });

  it("sends the full JSON schema via native response_format and validates strictly", async () => {
    const validStrategy = {
      angle: "Evidence-led narrative",
      audience: "Nature readers",
      tone: "accessible",
      keyPoints: ["Magnetic cues", "Stopover ecology"],
      outline: ["Introduction", "Evidence", "Conclusion"],
    };
    const stub = stubProviderResponses([{ content: JSON.stringify(validStrategy) }]);
    const onAttempt = vi.fn();

    const { data, retries } = await generateStructured(StrategySchema, {
      purpose: "strategist",
      messages: [{ role: "user", content: "Article idea: Nightingale migration\nLanguage: en" }],
      store: openrouterStore(),
      onAttempt,
    });

    expect(retries).toBe(0);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(data.outline).toEqual(["Introduction", "Evidence", "Conclusion"]);

    // Provider received the native structured-output request matching the contract.
    expect(stub.callCount()).toBe(1);
    const rf = stub.requests[0].body.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
    };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    const props = rf.json_schema.schema.properties as Record<string, { type?: string; items?: { type?: string } }>;
    expect(props.outline.items?.type).toBe("string");
    // The prompt also restates the same JSON schema.
    const userMsg = (stub.requests[0].body.messages as { role: string; content: string }[]).at(-1)?.content ?? "";
    expect(userMsg).toContain("JSON_SCHEMA");
    expect(userMsg).toContain('"outline"');
    expect(userMsg.replace(/\s+/g, "")).toContain('"outline":{"type":"array","items":{"type":"string"}}');
  });

  it("rejects a model response where outline[0] is an object, repairs, then succeeds", async () => {
    const malformed = {
      angle: "Evidence-led narrative",
      audience: "Nature readers",
      tone: "accessible",
      keyPoints: ["Magnetic cues"],
      outline: [{ angle: "Navigation via magnetoreception", audience: "General readers" }],
    };
    const valid = {
      angle: "Evidence-led narrative",
      audience: "Nature readers",
      tone: "accessible",
      keyPoints: ["Magnetic cues"],
      outline: ["Introduction", "Evidence"],
    };
    const stub = stubProviderResponses([
      { content: JSON.stringify(malformed) },
      { content: JSON.stringify(valid) },
    ]);

    const attempts: { ok: boolean; error?: string }[] = [];
    const { data, retries } = await generateStructured(StrategySchema, {
      purpose: "strategist",
      messages: [{ role: "user", content: "Article idea: Nightingale migration\nLanguage: en" }],
      store: openrouterStore(),
      onAttempt: (info) => attempts.push({ ok: info.ok, error: info.error }),
    });

    // First attempt rejected with the production error, second repaired.
    expect(attempts.length).toBe(2);
    expect(attempts[0].ok).toBe(false);
    expect(attempts[0].error).toContain('Schema validation failed at "outline.0": Expected string, received object');
    expect(retries).toBe(1);
    expect(Array.isArray(data.outline)).toBe(true);
    expect(typeof data.outline[0]).toBe("string");

    // Repair request restates the schema and quotes the failure.
    const repairMsg = (stub.requests[1].body.messages as { role: string; content: string }[]).at(-1)?.content ?? "";
    expect(repairMsg).toContain("Your previous output was INVALID");
    expect(repairMsg).toContain('Expected string, received object');
    expect(stub.requests[1].body.response_format).toMatchObject({ type: "json_schema" });
  });

  it("exhausts retries and FAILS loudly when every attempt returns objects (no silent fallback)", async () => {
    const malformed = {
      angle: "x",
      audience: "y",
      tone: "z",
      keyPoints: ["k"],
      outline: [{ angle: "a", audience: "b" }],
    };
    stubProviderResponses([
      { content: JSON.stringify(malformed) },
      { content: JSON.stringify(malformed) },
      { content: JSON.stringify(malformed) },
    ]);

    await expect(
      generateStructured(StrategySchema, {
        purpose: "strategist",
        messages: [{ role: "user", content: "Topic: migration\nLanguage: en" }],
        store: openrouterStore(),
      })
    ).rejects.toThrow(/Structured output failed after 3 attempts.*Expected string, received object/s);
  });

  it("downgrades to json_object when the provider rejects json_schema (400)", async () => {
    const valid = {
      angle: "a",
      audience: "b",
      tone: "c",
      keyPoints: ["k"],
      outline: ["Intro"],
    };
    const stub = stubProviderResponses([
      { errorBody: JSON.stringify({ error: { message: "response_format json_schema is not supported by this model" } }) },
      { content: JSON.stringify(valid) },
    ]);

    const { data } = await generateStructured(StrategySchema, {
      purpose: "strategist",
      messages: [{ role: "user", content: "Topic: migration\nLanguage: en" }],
      store: openrouterStore(),
    });
    expect(data.outline).toEqual(["Intro"]);
    const firstFormat = stub.requests[0].body.response_format as { type: string };
    expect(firstFormat.type).toBe("json_schema");
    const secondFormat = stub.requests[1].body.response_format as { type: string };
    expect(secondFormat.type).toBe("json_object");
  });
});
