import { describe, expect, it } from "vitest";
import { chunkText, countChunks } from "./chunk";

const longText = Array.from({ length: 120 }, (_, i) => `Sentence number ${i + 1} contains some details to fill out the chunk buffer.`).join(" ");

describe("chunkText", () => {
  it("returns empty for blank input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("produces chunks under the size limit", () => {
    const chunks = chunkText(longText, 900, 120);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(900);
      expect(c.trim().length).toBeGreaterThan(20);
    }
  });

  it("reassembles content without losing sentences", () => {
    const chunks = chunkText(longText, 500, 60);
    const joined = chunks.join(" ");
    expect(joined).toMatch(/Sentence number 1/);
    expect(joined).toMatch(/Sentence number 120/);
  });

  it("drops tiny fragments under the minimum chunk size", () => {
    const chunks = chunkText("Short text here.");
    expect(chunks).toEqual([]);
  });

  it("keeps a longer short text as a single chunk", () => {
    const chunks = chunkText("A longer sentence that comfortably exceeds the minimum chunk size threshold.");
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain("longer sentence");
  });
});

describe("countChunks", () => {
  it("matches chunkText length", () => {
    expect(countChunks(longText)).toBe(chunkText(longText).length);
  });
});
