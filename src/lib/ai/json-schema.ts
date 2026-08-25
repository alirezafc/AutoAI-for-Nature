import type { ZodType } from "zod";

/**
 * Canonical Zod → JSON Schema conversion.
 *
 * This is the SINGLE source of truth for machine-readable schemas: the exact
 * object produced here is what is sent to providers (`response_format:
 * json_schema`) and embedded in prompts. Application-side validation always
 * stays with the original Zod schema, so there can never be two competing
 * schemas drifting apart.
 *
 * Scope: the subset of Zod used by the agent contracts (objects, arrays,
 * strings, numbers, booleans, enums, literals, records). Constraints like
 * min/max or regex are intentionally NOT emitted: strict structured-output
 * endpoints only accept a conservative keyword set, and those constraints are
 * already enforced locally by the Zod schema after every response.
 */

export interface GeneratedJsonSchema {
  /** Draft-style JSON Schema object, safe to embed in `response_format`. */
  schema: Record<string, unknown>;
  /**
   * True when every object in the schema forbids additional properties.
   * Only then may the provider request use `strict: true`.
   */
  strictSafe: boolean;
}

interface ZodDef {
  typeName?: string;
  shape?: Record<string, ZodType> | (() => Record<string, ZodType>);
  innerType?: ZodType;
  /** ZodArray element type (zod v3). */
  type?: ZodType;
  /** ZodRecord value type (zod v3). */
  valueType?: ZodType;
  /** ZodEffects wrapped type (zod v3). */
  schema?: ZodType;
  values?: unknown[];
  value?: unknown;
  options?: ZodType[];
  checks?: { kind?: string; value?: unknown }[];
  description?: string;
}

function defOf(zodType: ZodType): ZodDef {
  return ((zodType as unknown as { _def?: ZodDef })._def ?? {}) as ZodDef;
}

function shapeOf(zodType: ZodType): Record<string, ZodType> {
  const raw = defOf(zodType).shape;
  if (typeof raw === "function") return raw();
  if (raw && typeof raw === "object") return raw;
  // ZodObject exposes a `shape` getter on the instance as a fallback.
  const direct = (zodType as unknown as { shape?: Record<string, ZodType> }).shape;
  return direct && typeof direct === "object" ? direct : {};
}

function convert(zodType: ZodType, state: { strictSafe: boolean }): Record<string, unknown> {
  const def = defOf(zodType);
  switch (def.typeName) {
    case "ZodObject": {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shapeOf(zodType))) {
        properties[key] = convert(child, state);
        if (!isOptional(child)) required.push(key);
      }
      // Objects are closed (`additionalProperties: false`) by closeObjects
      // after conversion, so nested objects remain strict-compatible.
      return { type: "object", properties, required };
    }
    case "ZodArray": {
      const out: Record<string, unknown> = {
        type: "array",
        items: convert(def.type as ZodType, state),
      };
      return out;
    }
    case "ZodString": {
      const out: Record<string, unknown> = { type: "string" };
      return out;
    }
    case "ZodNumber": {
      const isInt = (def.checks ?? []).some((c) => c.kind === "int");
      return isInt ? { type: "integer" } : { type: "number" };
    }
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum": {
      const values = def.values ?? [];
      return { enum: [...values] };
    }
    case "ZodLiteral":
      return { enum: [def.value] };
    case "ZodUnion": {
      const options = def.options ?? [];
      const literals = options.map((o) => defOf(o));
      if (
        options.length > 0 &&
        literals.every((d) => d.typeName === "ZodLiteral" || d.typeName === "ZodEnum")
      ) {
        const merged = new Set<unknown>();
        for (const d of literals) {
          if (d.typeName === "ZodLiteral") merged.add(d.value);
          else for (const v of d.values ?? []) merged.add(v);
        }
        return { enum: [...merged] };
      }
      return { anyOf: options.map((o) => convert(o, state)) };
    }
    case "ZodRecord": {
      // Map-like objects cannot forbid extra keys -> not strict-safe.
      state.strictSafe = false;
      return { type: "object", additionalProperties: {} };
    }
    case "ZodOptional":
    case "ZodNullable":
    case "ZodEffects":
      return convert((def.innerType ?? def.schema) as ZodType, state);
    default:
      // Unknown construct: keep permissive but let Zod validate locally.
      return {};
  }
}

function isOptional(zodType: ZodType): boolean {
  const def = defOf(zodType);
  return def.typeName === "ZodOptional" || def.typeName === "ZodNullable";
}

/**
 * Convert an object-shaped Zod schema into a JSON Schema for structured
 * outputs. Top-level objects close with `additionalProperties: false` unless a
 * nested record made the schema non-strict-safe.
 */
export function zodToJsonSchema(schema: ZodType): GeneratedJsonSchema {
  const state = { strictSafe: true };
  const converted = convert(schema, state);
  const strictSafe = state.strictSafe;

  // Re-walk to close every object except record-derived maps. Simplest
  // correct approach: close objects whose properties we generated (they carry
  // `required`), leave records (which carry `additionalProperties`) open.
  const closed = closeObjects(converted) as Record<string, unknown>;
  return { schema: closed, strictSafe };
}

function closeObjects(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(closeObjects);
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) result[k] = closeObjects(v);
    const isRecordMap = typeof obj.additionalProperties === "object" && obj.additionalProperties !== null;
    if (obj.type === "object" && !isRecordMap && obj.properties !== undefined && !("additionalProperties" in obj)) {
      result.additionalProperties = false;
    }
    return result;
  }
  return node;
}
