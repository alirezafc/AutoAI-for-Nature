import { describe, expect, it } from "vitest";
import {
  cn,
  estimateReadingMinutes,
  formatDuration,
  normalizeText,
  slugify,
  timeAgo,
  truncate,
} from "./utils";

describe("slugify", () => {
  it("lowercases and kebab-cases", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });

  it("strips punctuation but keeps unicode letters", () => {
    expect(slugify("Coral Reefs, Survival & Warming Oceans!")).toBe("coral-reefs-survival-warming-oceans");
    expect(slugify("طبیعت و حفاظت از جنگل")).toContain("-");
  });

  it("collapses separators and trims dashes", () => {
    expect(slugify("a___b    c--d")).toBe("a-b-c-d");
    expect(slugify("-edge case-")).toBe("edge-case");
  });

  it("falls back to empty string for non-identifiable input", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("truncate", () => {
  it("keeps short text unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("appends ellipsis to long text", () => {
    const out = truncate("a very long sentence here", 10);
    expect(out).toMatch(/…$/);
    expect(out.length).toBeLessThanOrEqual(11);
  });
});

describe("estimateReadingMinutes", () => {
  it("returns at least 1 minute", () => {
    expect(estimateReadingMinutes("one")).toBe(1);
  });

  it("scales with word count", () => {
    const words = Array.from({ length: 400 }, () => "word").join(" ");
    expect(estimateReadingMinutes(words)).toBe(2);
  });
});

describe("formatDuration", () => {
  it("formats ms, seconds and minutes", () => {
    expect(formatDuration(450)).toBe("450ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("handles null and NaN", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(NaN)).toBe("—");
  });
});

describe("timeAgo", () => {
  it("returns just now for fresh timestamps", () => {
    expect(timeAgo(new Date().toISOString())).toBe("just now");
  });

  it("returns minutes ago", () => {
    const past = new Date(Date.now() - 2 * 60 * 1000);
    expect(timeAgo(past.toISOString())).toMatch(/min ago/);
  });
});

describe("misc", () => {
  it("normalizeText trims and collapses whitespace", () => {
    expect(normalizeText("  Hello   WORLD  ")).toBe("hello world");
  });

  it("cn merges classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });
});
