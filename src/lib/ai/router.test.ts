import { describe, it, expect } from "vitest";
import { normalizeEmbedding } from "./router";
import { EMBEDDING_DIMENSIONS } from "@/db/schema/common";
import { ProviderError } from "./errors";

describe("normalizeEmbedding", () => {
  it("accepts embeddings that exactly match the canonical dimension", () => {
    const raw = new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => ((i % 7) - 3) / 7);
    expect(normalizeEmbedding(raw)).toEqual(raw);
    expect(EMBEDDING_DIMENSIONS).toBe(2048);
  });

  it("REJECTS shorter vectors instead of zero-padding them", () => {
    const raw = [3, 4];
    expect(() => normalizeEmbedding(raw)).toThrow(ProviderError);
    expect(() => normalizeEmbedding(raw)).toThrow(/dimension mismatch/i);
  });

  it("REJECTS longer vectors instead of truncating them", () => {
    const raw = new Array(EMBEDDING_DIMENSIONS + 1).fill(0.1);
    expect(() => normalizeEmbedding(raw)).toThrow(ProviderError);
  });

  it("rejects a legacy 1536-dimension vector (no silent truncation to schema)", () => {
    const raw = new Array(1536).fill(0).map((_, i) => Math.sin(i));
    expect(() => normalizeEmbedding(raw)).toThrow(/1536.*2048|2048.*1536/s);
  });
});
