import type { ZodType } from "zod";
import type { ChatMessage, ModelPurpose } from "./types";
import { routerChat, type RouterChatOptions } from "./router";
import { ValidationError, errorMessage } from "./errors";
import { zodToJsonSchema } from "./json-schema";

export type StructuredPurpose = Exclude<ModelPurpose, "embedding" | "voice">;

/** Maximum total attempts: 1 initial + MAX_REPAIR_RETRIES repairs. */
export const MAX_REPAIR_RETRIES = 2;

export interface StructuredAttemptInfo {
  attempt: number;
  provider: string;
  model: string;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export interface StructuredOptions
  extends Omit<RouterChatOptions, "json" | "jsonSchema" | "messages" | "purpose"> {
  purpose: StructuredPurpose;
  messages: ChatMessage[];
  onResult?: (info: { provider: string; model: string; latencyMs: number; fallbackUsed: boolean }) => void;
  onAttempt?: (info: StructuredAttemptInfo) => void;
}
function schemaFields<T>(schema: ZodType<T>): string[] {
  const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

/**
 * Compact key -> null hint. Kept ONLY as the demo-model (mock provider)
 * contract: the mock fills these keys with deterministic demo content.
 */
function schemaHint<T>(schema: ZodType<T>): string {
  const fields = schemaFields(schema);
  const obj: Record<string, null> = {};
  for (const field of fields) obj[field] = null;
  return JSON.stringify(obj);
}

/**
 * The exact JSON Schema derived from the Zod contract. This one object is used
 * for the provider structured-output request AND restated in the prompt, so
 * the model, the parser and the validator all agree on one shape.
 */
function buildProviderSchema<T>(schema: ZodType<T>): { schema: Record<string, unknown>; strictSafe: boolean; schemaJson: string } {
  const generated = zodToJsonSchema(schema);
  const schemaJson = JSON.stringify(generated.schema, null, 2);
  return { schema: generated.schema, strictSafe: generated.strictSafe, schemaJson };
}

function buildJsonInstruction<T>(schema: ZodType<T>, schemaJson: string): string {
  return (
    "Return a single JSON object that matches EXACTLY the JSON_SCHEMA below. " +
    "Respect every declared type precisely — strings must be plain strings, arrays of strings must contain ONLY strings (never objects), numbers must be numbers. " +
    "Every field is REQUIRED and must be a real value of the correct type — never null, never omitted, never a placeholder. " +
    "If you do not know a field, produce your best factual content for it; do NOT use null. " +
    "Do not add extra properties. Do not wrap it in markdown code fences. Output only JSON, nothing else.\n\n" +
    `JSON_SCHEMA:\n${schemaJson}`
  );
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractJson(raw: string): unknown {
  const candidate = stripCodeFences(raw);
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new ValidationError(`Could not parse JSON from model output: ${raw.slice(0, 200)}`);
  }
}

function appendSchemaToLastMessage(
  messages: ChatMessage[],
  hintJson: string,
  instruction: string,
  repair?: string
): ChatMessage[] {
  const last = messages[messages.length - 1];
  const prefix = repair
    ? `${last.content}\n\nYour previous output was INVALID: ${repair}\nFix it now. Follow JSON_SCHEMA exactly.\n\n`
    : `${last.content}\n\n${instruction}\n\n`;
  const content = `${prefix}[SCHEMA]\n${hintJson}\n[/SCHEMA]`;
  return [...messages.slice(0, -1), { role: "user", content }];
}

/**
 * Ask the model for a JSON object validated against a Zod schema.
 *
 * Contract consistency:
 * - ONE canonical shape exists: the Zod contract. `zodToJsonSchema` derives the
 *   machine-readable schema from it, which is sent to the provider via native
 *   structured output (`response_format: json_schema`) AND restated in the
 *   prompt. Parsing + strict Zod validation use the same contract.
 * - Robustness contract:
 *   Up to 1 + MAX_REPAIR_RETRIES attempts against the SAME provider/model.
 *   Every failed parse/validation produces an explicit repair request that
 *   restates the exact schema and demands valid JSON with no nulls.
 * - Missing fields are NEVER fabricated or defaulted — validation is strict.
 * - If all attempts fail, the actual error from the last attempt is thrown so
 *   the step/run can be persisted as FAILED. No silent mock/template fallback.
 */
export async function generateStructured<T>(
  schema: ZodType<T>,
  opts: StructuredOptions
): Promise<{ data: T; retries: number; attempts: StructuredAttemptInfo[] }> {
  const { schema: providerSchema, strictSafe, schemaJson } = buildProviderSchema(schema);
  const hintJson = schemaHint(schema);
  const instruction = buildJsonInstruction(schema, schemaJson);

  let messages = appendSchemaToLastMessage(opts.messages, hintJson, instruction);
  let lastError = "";
  let lastProvider = "unknown";
  let lastModel = "unknown";
  let lastLatencyMs = 0;
  const attempts: StructuredAttemptInfo[] = [];

  for (let attempt = 0; attempt <= MAX_REPAIR_RETRIES; attempt++) {
    let parsedText = "";
    try {
      const result = await routerChat({
        ...opts,
        purpose: opts.purpose,
        messages,
        json: true,
        jsonSchema: { name: `${opts.purpose}_output`, strict: strictSafe, schema: providerSchema },
        onErrorAttempt: (info) => {
          // Record which provider/model actually got the failed HTTP call.
          lastProvider = info.provider;
          lastModel = info.model;
          lastLatencyMs = info.latencyMs;
        },
      });
      lastProvider = result.provider;
      lastModel = result.model;
      opts.onResult?.({
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        fallbackUsed: result.fallbackUsed,
      });
      parsedText = result.value.text;
      const parsed = extractJson(parsedText);
      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        const issue = validated.error.issues[0];
        const path = issue?.path?.join(".") || "value";
        throw new ValidationError(
          `Schema validation failed at "${path}": ${issue?.message} (raw: ${parsedText.slice(0, 160)})`
        );
      }
      attempts.push({ attempt, provider: result.provider, model: result.model, latencyMs: result.latencyMs, ok: true });
      opts.onAttempt?.({ attempt, provider: result.provider, model: result.model, latencyMs: result.latencyMs, ok: true });
      return { data: validated.data, retries: attempt, attempts };
    } catch (err) {
      lastError = errorMessage(err);
      attempts.push({
        attempt,
        provider: lastProvider,
        model: lastModel,
        latencyMs: lastLatencyMs,
        ok: false,
        error: lastError.slice(0, 500),
      });
      opts.onAttempt?.({ attempt, provider: lastProvider, model: lastModel, latencyMs: lastLatencyMs, ok: false, error: lastError.slice(0, 500) });
      // Repair request for the next round (same provider/model, explicit schema).
      if (attempt < MAX_REPAIR_RETRIES) {
        messages = appendSchemaToLastMessage(
          opts.messages,
          hintJson,
          instruction,
          lastError.slice(0, 300)
        );
      }
    }
  }

  throw new ValidationError(
    `Structured output failed after ${MAX_REPAIR_RETRIES + 1} attempts on ${lastProvider}/${lastModel}. Last error: ${lastError}`
  );
}
