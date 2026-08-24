import { customType } from "drizzle-orm/pg-core";

/**
 * PostgreSQL `vector` column backed by the pgvector extension.
 * Stored as a string like "[0.1,0.2,...]" over the wire.
 */
export const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return "[" + value.join(",") + "]";
    },
    fromDriver(value: string): number[] {
      return value
        .replace(/[\[\]]/g, "")
        .split(",")
        .filter((n) => n.length > 0)
        .map((n) => parseFloat(n));
    },
  });

/**
 * Canonical embedding dimension. MUST match the production embedding model
 * exactly — currently OpenRouter `nvidia/nemotron-3-embed-1b:free` = 2048.
 *
 * The pgvector column type (`vector(2048)`) and every runtime check derive
 * from this constant. Vectors are NEVER truncated or padded to fit: a model
 * whose output dimension differs from this value fails loudly and requires
 * changing this constant + re-indexing the whole knowledge base.
 */
export const EMBEDDING_DIMENSIONS = 2048;
