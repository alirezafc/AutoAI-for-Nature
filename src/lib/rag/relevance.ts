/**
 * Pure, unit-testable retrieval decision helpers.
 *
 * The retrieval contract:
 * - Only documents whose source_type is allowed by rag.sources are candidates.
 * - Vectors are only comparable within ONE embedding identity
 *   (provider + model + dimensions); the SQL layer enforces this.
 * - A hit requires cosine similarity >= threshold (real models: 0.4;
 *   the deterministic demo embedder uses its own calibrated scale).
 */

export const REAL_RELEVANCE_THRESHOLD = 0.4;
export const MOCK_RELEVANCE_THRESHOLD = 0.09;

export interface RagSourcesSettingsLike {
  publishedArticles?: boolean;
  curatedKnowledge?: boolean;
  draftArticles?: boolean;
}

/** Source types eligible for retrieval given the knowledge-sources settings. */
export function allowedSourceTypes(sources: RagSourcesSettingsLike): string[] {
  const types: string[] = [];
  if (sources.publishedArticles !== false) types.push("article");
  if (sources.curatedKnowledge !== false) types.push("curated");
  if (Boolean(sources.draftArticles)) types.push("draft_article");
  return types;
}

export function relevanceThreshold(isMockEmbedder: boolean): number {
  return isMockEmbedder ? MOCK_RELEVANCE_THRESHOLD : REAL_RELEVANCE_THRESHOLD;
}

export interface ScoredResult {
  similarity: number;
}

/**
 * Decide whether ANY retrieved chunk clears the relevance threshold.
 * Unrelated questions must produce hasRelevant=false so the grounding guard
 * refuses instead of answering from general model knowledge.
 */
export function evaluateRelevance(results: ScoredResult[], threshold: number): { hasRelevant: boolean; topSimilarity: number | null } {
  if (results.length === 0) return { hasRelevant: false, topSimilarity: null };
  const topSimilarity = Math.max(...results.map((r) => r.similarity));
  return { hasRelevant: topSimilarity >= threshold, topSimilarity };
}
