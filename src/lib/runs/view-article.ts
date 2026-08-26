/**
 * Gate for the "View Article" action on agent-run pages.
 *
 * createRun() reserves an EMPTY draft post up-front so the pipeline has a
 * target — meaning run.postId alone proves nothing about article readiness.
 * The decision therefore relies on REAL persisted post state:
 *
 *   needs_review / published        -> viewable (pipeline output or human edit)
 *   draft WITH content              -> viewable (manually saved draft)
 *   draft WITHOUT content           -> NOT viewable (reserved placeholder,
 *                                      incl. every active-generation moment)
 */
export interface RunArticleGateInput {
  postId?: string | null;
  /** Persisted posts.status for run.postId (null when the post was removed). */
  postStatus?: string | null;
  /** Whether the persisted post body has non-whitespace content. */
  postHasContent?: boolean;
}

export function canViewArticle(input: RunArticleGateInput): boolean {
  if (!input.postId) return false;
  if (!input.postStatus) return false;
  if (input.postStatus === "published" || input.postStatus === "needs_review") return true;
  return input.postStatus === "draft" && input.postHasContent === true;
}
