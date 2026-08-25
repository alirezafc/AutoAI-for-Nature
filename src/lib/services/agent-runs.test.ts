import { describe, expect, it } from "vitest";
import { selectRunsToFinalize } from "./agent-runs";
import {
  allowedSourceTypes,
  evaluateRelevance,
  relevanceThreshold,
  REAL_RELEVANCE_THRESHOLD,
} from "@/lib/rag/relevance";

describe("BUG 2 regression — run finalization on publish", () => {
  const run = (id: string, postId: string | null, status: string) => ({ id, postId, status });

  it("selects EVERY waiting_for_human run linked to the post (multi-run/regeneration case)", () => {
    const runs = [
      run("run-a", "post-1", "waiting_for_human"),
      run("run-b", "post-1", "waiting_for_human"),
      run("run-c", "post-2", "waiting_for_human"),
    ];
    const ids = selectRunsToFinalize(runs, "post-1").map((r) => r.id);
    expect(ids.sort()).toEqual(["run-a", "run-b"]);
  });

  it("never touches other posts or already-terminal runs", () => {
    const runs = [
      run("old", "post-1", "completed"),
      run("failed", "post-1", "failed"),
      run("foreign", "post-9", "waiting_for_human"),
      run("null-post", null, "waiting_for_human"),
      run("target", "post-1", "waiting_for_human"),
    ];
    expect(selectRunsToFinalize(runs, "post-1").map((r) => r.id)).toEqual(["target"]);
  });
});

describe("BUG 1 regression — retrieval decision contract", () => {
  it("published articles are retrievable: default sources include the article type", () => {
    expect(allowedSourceTypes({ publishedArticles: true, curatedKnowledge: true, draftArticles: false })).toContain("article");
    // Missing flags default to enabled (fresh production settings rows).
    expect(allowedSourceTypes({})).toEqual(["article", "curated"]);
  });

  it("query/index embedding identity threshold: real-model hits clear 0.4, unrelated do not", () => {
    expect(relevanceThreshold(false)).toBe(REAL_RELEVANCE_THRESHOLD);
    const relevant = evaluateRelevance([{ similarity: 0.58 }, { similarity: 0.31 }], REAL_RELEVANCE_THRESHOLD);
    expect(relevant.hasRelevant).toBe(true);

    const unrelated = evaluateRelevance(
      [{ similarity: 0.21 }, { similarity: 0.18 }, { similarity: 0.09 }],
      REAL_RELEVANCE_THRESHOLD
    );
    expect(unrelated.hasRelevant).toBe(false);
  });

  it("empty candidate set is never relevant (grounding refusal path)", () => {
    const out = evaluateRelevance([], REAL_RELEVANCE_THRESHOLD);
    expect(out.hasRelevant).toBe(false);
    expect(out.topSimilarity).toBeNull();
  });

  it("borderline similarities below threshold stay excluded — no silent weakening", () => {
    expect(evaluateRelevance([{ similarity: 0.399 }], 0.4).hasRelevant).toBe(false);
    expect(evaluateRelevance([{ similarity: 0.4 }], 0.4).hasRelevant).toBe(true);
  });
});
