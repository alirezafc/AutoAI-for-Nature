import { describe, expect, it } from "vitest";
import { canViewArticle } from "./view-article";

describe("View Article gate (regression: shown during generation)", () => {
  it("generation without a post -> unavailable", () => {
    expect(canViewArticle({ postId: null, postStatus: null, postHasContent: false })).toBe(false);
  });

  it("active generation with the reserved EMPTY draft -> unavailable", () => {
    expect(
      canViewArticle({ postId: "p1", postStatus: "draft", postHasContent: false })
    ).toBe(false);
    expect(
      canViewArticle({ postId: "p1", postStatus: "draft", postHasContent: false })
    ).toBe(false);
  });

  it("waiting_for_human with real pipeline content (needs_review) -> available", () => {
    expect(
      canViewArticle({ postId: "p1", postStatus: "needs_review", postHasContent: true })
    ).toBe(true);
  });

  it("published -> available", () => {
    expect(
      canViewArticle({ postId: "p1", postStatus: "published", postHasContent: true })
    ).toBe(true);
  });

  it("manually saved draft WITH content -> available", () => {
    expect(
      canViewArticle({ postId: "p1", postStatus: "draft", postHasContent: true })
    ).toBe(true);
  });

  it("failed run on empty draft -> unavailable", () => {
    expect(
      canViewArticle({ postId: "p1", postStatus: "draft", postHasContent: false })
    ).toBe(false);
  });

  it("deleted/missing post row -> unavailable", () => {
    expect(
      canViewArticle({ postId: "p1", postStatus: null, postHasContent: false })
    ).toBe(false);
  });
});
