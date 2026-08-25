import { eq, desc, and, like, or, count } from "drizzle-orm";
import { posts, postRevisions, categories, feedback, agentRuns, agentSteps as agentStepsTable, type NewPostRevision, type PostRevision } from "@/db/schema";
import { getDb } from "@/db/client";
import { slugify } from "@/lib/utils";
import { syncKnowledgeFromPost } from "@/lib/rag";
import { logAudit } from "./audit";
import { logger } from "@/lib/logging";

export type PostStatus = "draft" | "published" | "needs_review" | "rejected";

export interface PostInput {
  title: string;
  content?: string;
  excerpt?: string;
  language?: "en" | "fa";
  status?: PostStatus;
  categoryId?: string | null;
  coverImage?: string;
  isAiGenerated?: boolean;
  agentRunId?: string | null;
  seo?: Record<string, unknown>;
  authorName?: string;
  slug?: string;
  tags?: string[];
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  reviewReason?: string | null;
}

export async function listPosts(opts: {
  status?: string;
  language?: string;
  search?: string;
  limit?: number;
  offset?: number;
  categoryId?: string;
} = {}) {
  const c = await getDb();
  const conds = [];
  if (opts.status) conds.push(eq(posts.status, opts.status));
  if (opts.language) conds.push(eq(posts.language, opts.language));
  if (opts.categoryId) conds.push(eq(posts.categoryId, opts.categoryId));
  if (opts.search) {
    const searchCond = or(like(posts.title, `%${opts.search}%`), like(posts.excerpt, `%${opts.search}%`));
    if (searchCond) conds.push(searchCond);
  }

  const where = conds.length ? and(...conds) : undefined;
  const base = c.db
    .select({
      post: posts,
      category: {
        id: categories.id,
        slug: categories.slug,
        nameEn: categories.nameEn,
        nameFa: categories.nameFa,
        color: categories.color,
      },
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id));
  let q: typeof base = base;
  if (where) q = base.where(where) as unknown as typeof base;
  const rows = await q
    .orderBy(desc(posts.createdAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({ ...r.post, category: r.category }));
}

export async function listPublishedPosts(opts: { language?: string; limit?: number; categorySlug?: string; search?: string } = {}) {
  const c = await getDb();
  const conds = [eq(posts.status, "published")];
  if (opts.language) conds.push(eq(posts.language, opts.language));
  if (opts.search) {
    const searchCond = or(like(posts.title, `%${opts.search}%`), like(posts.excerpt, `%${opts.search}%`));
    if (searchCond) conds.push(searchCond);
  }
  if (opts.categorySlug) conds.push(eq(categories.slug, opts.categorySlug));

  const where = and(...conds);
  if (!where) {
    return [];
  }
  const rows = await c.db
    .select({
      post: posts,
      category: {
        id: categories.id,
        slug: categories.slug,
        nameEn: categories.nameEn,
        nameFa: categories.nameFa,
        color: categories.color,
      },
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(where)
    .orderBy(desc(posts.publishedAt))
    .limit(opts.limit ?? 60);

  return rows.map((r) => ({ ...r.post, category: r.category }));
}

export async function getPost(id: string) {
  const c = await getDb();
  const rows = await c.db
    .select({
      post: posts,
      category: {
        id: categories.id,
        slug: categories.slug,
        nameEn: categories.nameEn,
        nameFa: categories.nameFa,
        color: categories.color,
      },
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(eq(posts.id, id))
    .limit(1);
  if (!rows[0]) return null;
  const feedbackRows = await c.db.select().from(feedback).where(eq(feedback.postId, id));
  return { ...rows[0].post, category: rows[0].category, feedback: feedbackRows };
}

export async function getPostBySlug(slug: string, publishedOnly = false) {
  const c = await getDb();
  const conds = [eq(posts.slug, slug)];
  if (publishedOnly) conds.push(eq(posts.status, "published"));
  const rows = await c.db
    .select({
      post: posts,
      category: {
        id: categories.id,
        slug: categories.slug,
        nameEn: categories.nameEn,
        nameFa: categories.nameFa,
        color: categories.color,
      },
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(...conds))
    .limit(1);
  return rows[0] ? { ...rows[0].post, category: rows[0].category } : null;
}

export type PostPatch = Partial<Omit<PostInput, "title">> & { title?: string };

export async function createPost(input: PostInput, actor = "admin") {
  const c = await getDb();
  const baseSlug = input.slug || slugify(input.title) || "untitled";
  const [post] = await c.db
    .insert(posts)
    .values({
      slug: baseSlug,
      title: input.title,
      content: input.content ?? "",
      excerpt: input.excerpt ?? "",
      language: input.language ?? "en",
      status: input.status ?? "draft",
      categoryId: input.categoryId ?? null,
      coverImage: input.coverImage ?? "",
      isAiGenerated: input.isAiGenerated ?? false,
      agentRunId: input.agentRunId ?? null,
      seo: (input.seo ?? {}) as typeof posts.$inferInsert.seo,
      authorName: input.authorName ?? "AutoAI",
      tags: input.tags ?? [],
      wordCount: (input.content ?? "").trim().split(/\s+/).filter(Boolean).length,
      publishedAt: input.status === "published" ? new Date() : null,
    })
    .returning();
  await logAudit({ actor, action: "post.created", target: post.id, metadata: { title: post.title } });
  return post;
}

export async function updatePost(id: string, input: PostPatch, actor = "admin") {
  const c = await getDb();
  const existing = await getPost(id);
  const [post] = await c.db
    .update(posts)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined
        ? { content: input.content, wordCount: input.content.trim().split(/\s+/).filter(Boolean).length }
        : {}),
      ...(input.excerpt !== undefined ? { excerpt: input.excerpt } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.coverImage !== undefined ? { coverImage: input.coverImage } : {}),
      ...(input.seo !== undefined ? { seo: input.seo } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
      ...(input.reviewedBy !== undefined ? { reviewedBy: input.reviewedBy } : {}),
      ...(input.reviewReason !== undefined ? { reviewReason: input.reviewReason } : {}),
      ...(input.authorName !== undefined ? { authorName: input.authorName } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.status === "published" && existing?.status !== "published"
        ? { publishedAt: new Date() }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id))
    .returning();
  await logAudit({ actor, action: "post.updated", target: id });
  // Keep the knowledge mirror persistent: an edit to a PUBLISHED article must
  // be reflected in RAG (re-chunked + re-embedded), never left stale. Failures
  // are logged loudly — never silently ignored.
  if (
    input.content !== undefined &&
    input.content !== existing?.content &&
    post?.status === "published"
  ) {
    try {
      await syncKnowledgeFromPost(post as typeof posts.$inferSelect, "active");
    } catch (err) {
      logger.error(`knowledge re-sync failed for published post ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return post;
}

export async function setPostStatus(id: string, status: PostStatus, actor = "admin") {
  const c = await getDb();
  const existing = await getPost(id);
  const [post] = await c.db
    .update(posts)
    .set({
      status,
      ...(status === "published" ? { publishedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id))
    .returning();
  await logAudit({ actor, action: `post.status.${status}`, target: id });

  if (existing) {
    // Any publish transition finalizes ALL waiting_for_human runs linked to
    // this post (regenerations included) — the human decision happened, so no
    // run may remain "waiting for human" in Admin → Agent Runs.
    if (status === "published" && existing.status !== "published") {
      const { finalizeWaitingRunsForPost } = await import("./agent-runs");
      await finalizeWaitingRunsForPost(id);
    }
    const docStatus = status === "published" ? "active" : "inactive";
    await syncKnowledgeFromPost(
      { ...existing, status } as typeof posts.$inferSelect,
      docStatus
    );
  }
  return post;
}

export async function deletePost(id: string, actor = "admin"): Promise<void> {
  const c = await getDb();
  await c.db.delete(posts).where(eq(posts.id, id));
  await logAudit({ actor, action: "post.deleted", target: id });
}

export async function createPostRevision(postId: string, input: Omit<NewPostRevision, "postId">): Promise<PostRevision> {
  const c = await getDb();
  const prev = await c.db
    .select({ version: postRevisions.version })
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.version))
    .limit(1);
  const version = (prev[0]?.version ?? 0) + 1;
  const [rev] = await c.db
    .insert(postRevisions)
    .values({ ...input, postId, version })
    .returning();
  return rev;
}

export async function listPostRevisions(postId: string): Promise<PostRevision[]> {
  const c = await getDb();
  return c.db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.postId, postId))
    .orderBy(desc(postRevisions.version));
}

export interface SeoCheck {
  key: string;
  label: string;
  passed: boolean;
  value: string;
  detail: string;
}

export function seoChecks(post: { title: string; content: string; excerpt: string; slug: string; seo?: Record<string, unknown> | null }): SeoCheck[] {
  const metaTitle = String((post.seo as Record<string, unknown>)?.metaTitle ?? post.title);
  const metaDescription = String((post.seo as Record<string, unknown>)?.metaDescription ?? post.excerpt);
  const keywords = Array.isArray((post.seo as Record<string, unknown>)?.keywords)
    ? ((post.seo as Record<string, unknown>)?.keywords as string[])
    : [];
  const h1Count = (post.content.match(/(^|\n)#\s+/g) ?? []).length;
  const wordCount = post.content.trim().split(/\s+/).filter(Boolean).length;
  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug);

  return [
    {
      key: "titleLength",
      label: "Meta title length",
      passed: metaTitle.length >= 30 && metaTitle.length <= 70,
      value: `${metaTitle.length} chars`,
      detail: metaTitle.length >= 30 && metaTitle.length <= 70 ? "Ideal (30–70)".toUpperCase() : "Target 30–70",
    },
    {
      key: "descLength",
      label: "Meta description length",
      passed: metaDescription.length >= 70 && metaDescription.length <= 180,
      value: `${metaDescription.length} chars`,
      detail: metaDescription.length >= 70 && metaDescription.length <= 180 ? "Ideal (70–180)".toUpperCase() : "Target 70–180",
    },
    {
      key: "h1Count",
      label: "H1 count",
      passed: h1Count === 1,
      value: String(h1Count),
      detail: h1Count === 1 ? "Exactly one".toUpperCase() : "Use a single H1",
    },
    {
      key: "slug",
      label: "Slug validity",
      passed: slugValid,
      value: post.slug,
      detail: slugValid ? "Valid".toUpperCase() : "Use lowercase kebab-case",
    },
    {
      key: "wordCount",
      label: "Word count",
      passed: wordCount >= 400,
      value: `${wordCount} words`,
      detail: wordCount >= 400 ? "Substantial".toUpperCase() : "Aim for 400+ words",
    },
    {
      key: "keywords",
      label: "Keywords",
      passed: keywords.length >= 3,
      value: `${keywords.length} keywords`,
      detail: keywords.length >= 3 ? "Good coverage".toUpperCase() : "Add 3+ keywords",
    },
  ];
}

export async function getPostStats() {
  const c = await getDb();
  const published = await c.db
    .select({ n: count() })
    .from(posts)
    .where(eq(posts.status, "published"));
  const drafts = await c.db
    .select({ n: count() })
    .from(posts)
    .where(eq(posts.status, "draft"));
  const review = await c.db
    .select({ n: count() })
    .from(posts)
    .where(eq(posts.status, "needs_review"));
  return {
    published: Number(published[0]?.n ?? 0),
    drafts: Number(drafts[0]?.n ?? 0),
    needsReview: Number(review[0]?.n ?? 0),
  };
}

export async function relatedPosts(postId: string, language: string, categoryId: string | null, limit = 3) {
  const c = await getDb();
  const conds = [eq(posts.status, "published"), eq(posts.language, language)];
  if (categoryId) conds.push(eq(posts.categoryId, categoryId));
  const rows = await c.db
    .select({ id: posts.id, slug: posts.slug, title: posts.title, excerpt: posts.excerpt, coverImage: posts.coverImage, publishedAt: posts.publishedAt })
    .from(posts)
    .where(and(...conds))
    .orderBy(desc(posts.publishedAt))
    .limit(limit + 6);
  return rows.filter((r) => r.id !== postId).slice(0, limit);
}

export async function getRecentAiRuns(limit = 8) {
  const c = await getDb();
  const runs = await c.db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(limit);
  const steps = await c.db
    .select({ runId: agentStepsTable.runId, agent: agentStepsTable.agent, status: agentStepsTable.status, score: agentStepsTable.score, revision: agentStepsTable.revision })
    .from(agentStepsTable)
    .orderBy(agentStepsTable.createdAt);
  const byRun = new Map<string, { agent: string; status: string; score: number | null; revision: number }[]>();
  for (const s of steps) {
    const list = byRun.get(s.runId) ?? [];
    list.push({ agent: s.agent, status: s.status, score: s.score, revision: s.revision });
    byRun.set(s.runId, list);
  }
  return runs.map((r) => ({ ...r, steps: byRun.get(r.id) ?? [] }));
}
