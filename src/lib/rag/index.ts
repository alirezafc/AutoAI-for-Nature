import { eq, and, desc, sql } from "drizzle-orm";
import { knowledgeDocuments, posts } from "@/db/schema";
import { getDb, raw } from "@/db/client";
import { chunkText } from "./chunk";
import { routerEmbedding, embeddingToSqlString } from "@/lib/ai/router";
import { getSetting } from "@/lib/services/system-settings";
import { RAGError } from "@/lib/ai/errors";
import { logger } from "@/lib/logging";
import type { Post } from "@/db/schema/content";

export type KnowledgeSourceType = "curated" | "article" | "draft_article";

export interface KnowledgeDocumentInput {
  title: string;
  content: string;
  language: "en" | "fa";
  author?: string;
  sourceType?: KnowledgeSourceType;
  postId?: string | null;
  status?: "active" | "inactive";
}

const DOC_FIELDS = {
  id: knowledgeDocuments.id,
  title: knowledgeDocuments.title,
  content: knowledgeDocuments.content,
  language: knowledgeDocuments.language,
  status: knowledgeDocuments.status,
  sourceType: knowledgeDocuments.sourceType,
  postId: knowledgeDocuments.postId,
  author: knowledgeDocuments.author,
  chunkCount: knowledgeDocuments.chunkCount,
  indexedAt: knowledgeDocuments.indexedAt,
  embeddingProvider: knowledgeDocuments.embeddingProvider,
  embeddingModel: knowledgeDocuments.embeddingModel,
  embeddingDimensions: knowledgeDocuments.embeddingDimensions,
  createdAt: knowledgeDocuments.createdAt,
  updatedAt: knowledgeDocuments.updatedAt,
};

export async function listKnowledgeDocuments() {
  const c = await getDb();
  return c.db
    .select(DOC_FIELDS)
    .from(knowledgeDocuments)
    .orderBy(desc(knowledgeDocuments.updatedAt));
}

export async function getKnowledgeDocument(id: string) {
  const c = await getDb();
  const rows = await c.db.select(DOC_FIELDS).from(knowledgeDocuments).where(eq(knowledgeDocuments.id, id)).limit(1);
  return rows[0];
}

export async function createKnowledgeDocument(input: KnowledgeDocumentInput) {
  const c = await getDb();
  const [doc] = await c.db
    .insert(knowledgeDocuments)
    .values({
      title: input.title,
      content: input.content,
      language: input.language,
      author: input.author ?? "admin",
      sourceType: input.sourceType ?? "curated",
      postId: input.postId ?? null,
      status: input.status ?? "active",
    })
    .returning();
  return doc;
}

export async function updateKnowledgeDocument(
  id: string,
  input: Partial<KnowledgeDocumentInput>
) {
  const c = await getDb();
  const [doc] = await c.db
    .update(knowledgeDocuments)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.author !== undefined ? { author: input.author } : {}),
      // Canonical source-type/status translation (e.g. draft_article -> article
      // when the linked post is approved and published). These do NOT
      // invalidate existing embeddings — only content changes do.
      ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.postId !== undefined ? { postId: input.postId } : {}),
      // content changed -> embedding is stale until re-indexed
      ...(input.content !== undefined
        ? { indexedAt: null, chunkCount: 0, embeddingProvider: null, embeddingModel: null, embeddingDimensions: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocuments.id, id))
    .returning();
  return doc;
}

export async function deleteKnowledgeDocument(id: string): Promise<void> {
  const c = await getDb();
  await c.db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
}

export async function setDocumentStatus(id: string, status: "active" | "inactive") {
  const c = await getDb();
  const [doc] = await c.db
    .update(knowledgeDocuments)
    .set({ status, updatedAt: new Date() })
    .where(eq(knowledgeDocuments.id, id))
    .returning();
  return doc;
}

export async function indexDocument(id: string, runId = "index"): Promise<{ chunks: number; vectors: number }> {
  const c = await getDb();
  const doc = await getKnowledgeDocument(id);
  if (!doc) throw new RAGError("Document not found");

  const chunking = await getSetting("rag.chunking");
  const chunks = chunkText(doc.content, chunking.chunkSize, chunking.chunkOverlap);
  if (chunks.length === 0) {
    await c.db.update(knowledgeDocuments).set({ chunkCount: 0, indexedAt: new Date(), updatedAt: new Date() }).where(eq(knowledgeDocuments.id, id));
    return { chunks: 0, vectors: 0 };
  }

  // remove existing vectors before replacing
  await raw("DELETE FROM knowledge_chunks WHERE document_id = $1", [id]);

  let vectors = 0;
  let embeddingProvider: string | null = null;
  let embeddingModel: string | null = null;
  let embeddingDimensions: number | null = null;
  for (let i = 0; i < chunks.length; i++) {
    const res = await routerEmbedding({
      text: chunks[i],
      runId,
      store: ragStore,
    });
    // Persist the embedding identity used for this doc so retrieval can prove
    // it never mixes vectors from different models.
    if (i === 0) {
      embeddingProvider = res.provider;
      embeddingModel = res.model;
      embeddingDimensions = res.value.dimensions;
    }
    const vec = embeddingToSqlString(res.value.embedding);
    await raw(
      `INSERT INTO knowledge_chunks (document_id, content, chunk_index, language, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [id, chunks[i], i, doc.language, vec]
    );
    vectors++;
  }

  await c.db
    .update(knowledgeDocuments)
    .set({
      chunkCount: vectors,
      indexedAt: new Date(),
      embeddingProvider,
      embeddingModel,
      embeddingDimensions,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocuments.id, id));

  return { chunks: chunks.length, vectors };
}

export async function reindexAll(runId = "index-all"): Promise<{ documents: number; vectors: number }> {
  const docs = await listKnowledgeDocuments();
  let documents = 0;
  let vectors = 0;
  for (const doc of docs) {
    if (doc.status !== "active") continue;
    try {
      const res = await indexDocument(doc.id, runId);
      documents++;
      vectors += res.vectors;
    } catch (err) {
      logger.warn(`reindex failed for doc ${doc.id}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { documents, vectors };
}

export interface ReindexReport {
  success: boolean;
  runId: string;
  embedding: { provider: string; model: string; dimensions: number | null };
  documents: number;
  succeeded: number;
  failed: number;
  vectors: number;
  results: {
    id: string;
    title: string;
    status: string;
    ok: boolean;
    chunks: number;
    error?: string;
  }[];
}

/**
 * Re-index the ENTIRE knowledge base with the currently configured embedding
 * model. All existing vectors are deleted first so vectors from a different
 * provider/model can never coexist (no mixing). Returns a per-document report
 * with chunk counts and failures.
 */
export async function reindexAllDetailed(runId = "index-all"): Promise<ReindexReport> {
  const embedding = await getSetting("rag.embedding");
  const docs = await listKnowledgeDocuments();
  const activeDocs = docs.filter((d) => d.status === "active");

  // Wipe every vector so a model switch leaves no stale/mixed embeddings behind.
  await raw("DELETE FROM knowledge_chunks");

  const results: ReindexReport["results"] = [];
  let succeeded = 0;
  let failed = 0;
  let vectors = 0;

  for (const doc of activeDocs) {
    try {
      const res = await indexDocument(doc.id, runId);
      vectors += res.vectors;
      succeeded++;
      results.push({ id: doc.id, title: doc.title, status: doc.status, ok: true, chunks: res.vectors });
    } catch (err) {
      failed++;
      results.push({
        id: doc.id,
        title: doc.title,
        status: doc.status,
        ok: false,
        chunks: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const first = results.find((r) => r.ok);
  const dimensions =
    activeDocs.length > 0 && first
      ? (await getKnowledgeDocument(first.id))?.embeddingDimensions ?? null
      : null;

  return {
    success: failed === 0,
    runId,
    embedding: { provider: embedding.provider, model: embedding.model, dimensions },
    documents: activeDocs.length,
    succeeded,
    failed,
    vectors,
    results,
  };
}

const ragStore = {
  async getPurposeConfig(purpose: "embedding") {
    const cfg = await getSetting("rag.embedding");
    const isMock = cfg.provider === "mock";
    return {
      purpose: "embedding" as const,
      label: "Embeddings",
      primaryProvider: cfg.provider,
      primaryModel: cfg.model,
      // Fallback mirrors the primary for real providers (deduplicated in the
      // router); the mock can only be reached when it IS explicitly configured.
      fallbackProvider: isMock ? "mock" : cfg.provider,
      fallbackModel: isMock ? "autoai-demo-1" : cfg.model,
      temperature: 0,
      maxTokens: 0,
    };
  },
};

export interface SearchResult {
  id: string;
  documentId: string;
  title: string;
  content: string;
  language: string;
  sourceType: string;
  similarity: number;
  chunkIndex: number;
}

export async function searchKnowledge(
  query: string,
  opts: { language?: "en" | "fa"; topK?: number } = {}
): Promise<SearchResult[]> {
  const search = await getSetting("rag.search");
  const sources = await getSetting("rag.sources");
  const topK = opts.topK ?? search.topK ?? 4;

  const allowedTypes: string[] = [];
  if (sources.publishedArticles) allowedTypes.push("article");
  if (sources.curatedKnowledge) allowedTypes.push("curated");
  if (sources.draftArticles) allowedTypes.push("draft_article");
  if (allowedTypes.length === 0) return [];

  const res = await routerEmbedding({ text: query, runId: `rag-${query.length}`, store: ragStore });
  const vec = embeddingToSqlString(res.value.embedding);
  // Guarantee vectors are comparable: retrieve only chunks from documents that
  // were indexed with the exact same embedding provider+model as this query.
  const embProvider = res.provider;
  const embModel = res.model;

  const languageFilter = opts.language ? `AND kd.language = $3` : "";
  const params: unknown[] = [vec, allowedTypes.join(",")];
  if (opts.language) params.push(opts.language);
  const provParam = `$${params.length + 1}`;
  params.push(embProvider);
  const modelParam = `$${params.length + 1}`;
  params.push(embModel);

  const sql = `
    SELECT kc.id::text AS id, kc.document_id::text AS document_id, kd.title, kc.content,
           kc.language, kd.source_type AS source_type, kc.chunk_index AS chunk_index,
           1 - (kc.embedding <=> $1::vector) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kd.status = 'active'
      AND kd.source_type = ANY(string_to_array($2, ','))
      AND kd.embedding_provider = ${provParam}::text
      AND kd.embedding_model = ${modelParam}::text
      ${languageFilter}
    ORDER BY kc.embedding <=> $1::vector
    LIMIT ${Math.max(1, Math.min(20, topK))}
  `;

  const rows = await raw<Record<string, unknown>>(sql, params);
  return rows.map((r) => ({
    id: String(r.id),
    documentId: String(r.document_id),
    title: String(r.title),
    content: String(r.content),
    language: String(r.language),
    sourceType: String(r.source_type),
    chunkIndex: Number(r.chunk_index),
    similarity: Number(r.similarity),
  }));
}

export interface RAGSource {
  id: string;
  title: string;
  type: string;
  score: number;
}

export interface RagContextResult {
  context: string;
  sources: RAGSource[];
  hasRelevant: boolean;
}

/**
 * Relevance decision + displayed score are provider-aware.
 *
 * Real embedding models (OpenAI, etc.) produce cosine similarities in the
 * 0.0–1.0 range where 0.4+ is a genuine hit. The deterministic mock embedder
 * is a lexical hashing-embedding: absolute values are much smaller but still
 * separate relevant (>= 0.11) from irrelevant (~0.07) matches, so it gets a
 * proportional window mapped to a friendly 0–100 relevance score.
 */
async function relevanceMeta(query: string, language: "en" | "fa", topK: number) {
  const results = await searchKnowledge(query, { language, topK });
  if (results.length === 0) return { results, hasRelevant: false };
  const emb = await getSetting("rag.embedding");
  const isMock = emb.provider === "mock";
  const threshold = isMock ? 0.09 : 0.4;
  const hasRelevant = results.some((r) => r.similarity >= threshold);
  if (!hasRelevant) return { results, hasRelevant: false };
  const sources = results.map((r) => ({
    id: r.documentId,
    title: r.title,
    type: r.sourceType === "article" ? "article" : "knowledge",
    score: isMock ? Math.min(0.95, Math.round((r.similarity / 0.15) * 100) / 100) : Math.round(r.similarity * 100) / 100,
  }));
  return { results, sources, hasRelevant: true };
}

export async function buildRagContext(
  query: string,
  language: "en" | "fa",
  topK?: number
): Promise<RagContextResult> {
  const search = await getSetting("rag.search");
  const k = topK ?? search.topK ?? 4;
  const { results, sources, hasRelevant } = await relevanceMeta(query, language, k);
  if (!hasRelevant || !sources) {
    return { context: "", sources: [], hasRelevant: false };
  }
  const context = results
    .map((r, i) => `[Source ${i + 1}] ${r.title}\n${r.content}`)
    .join("\n\n---\n\n");
  return { context, sources, hasRelevant: true };
}

export interface PostKnowledgeSync {
  documentId: string;
  chunks: number;
  vectors: number;
}

/**
 * Mirror a published post into the knowledge base and (re-)index it with the
 * currently configured REAL embedding provider, so the chatbot can retrieve
 * the actual article as a source. Re-publishing an already-synced post updates
 * the existing document instead of duplicating it — and PROMOTES it from the
 * pre-publication state (draft_article/inactive) to the canonical published
 * state (article/active). Indexing failures propagate: publish-time callers
 * must never pretend indexing succeeded.
 */
export async function syncPublishedPostToKnowledge(
  post: Pick<Post, "id" | "title" | "content" | "language" | "status"> & { authorName?: string | null },
  runId = "publish"
): Promise<PostKnowledgeSync> {
  const docs = await listKnowledgeDocuments();
  const existing = docs.find((d) => d.postId === post.id);
  // Canonical content representation shared with syncKnowledgeFromPost.
  const content = `${post.title}\n\n${post.content}`;
  let docId: string;
  if (existing) {
    const updated = await updateKnowledgeDocument(existing.id, {
      title: post.title,
      content,
      language: (post.language as "en" | "fa") ?? "en",
      sourceType: "article",
      status: "active",
    });
    docId = updated.id;
  } else {
    const doc = await createKnowledgeDocument({
      title: post.title,
      content,
      language: (post.language as "en" | "fa") ?? "en",
      author: post.authorName ?? "AutoAI",
      sourceType: "article",
      postId: post.id,
      status: "active",
    });
    docId = doc.id;
  }
  const res = await indexDocument(docId, `${runId}-${post.id}`);
  return { documentId: docId, chunks: res.chunks, vectors: res.vectors };
}

export async function getVectorStats(): Promise<{ documents: number; chunks: number }> {
  const c = await getDb();
  try {
    const docs = await c.db.select({ count: sql<number>`count(*)` }).from(knowledgeDocuments);
    const rows = await raw<{ count: number }>("SELECT count(*)::int AS count FROM knowledge_chunks");
    return {
      documents: Number(docs[0]?.count ?? 0),
      chunks: Number(rows[0]?.count ?? 0),
    };
  } catch {
    return { documents: 0, chunks: 0 };
  }
}

export async function syncKnowledgeFromPost(post: Post, status: "active" | "inactive"): Promise<void> {
  const c = await getDb();
  const existing = await c.db
    .select(DOC_FIELDS)
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.postId, post.id))
    .limit(1);
  const doc = existing[0];
  // Canonical translation: a published post is an "article" knowledge source;
  // anything not yet published stays a "draft_article". Content always mirrors
  // the live post so title/content can never drift from it.
  const sourceType = post.status === "published" ? "article" : "draft_article";
  const content = `${post.title}\n\n${post.content}`;

  if (doc) {
    await c.db
      .update(knowledgeDocuments)
      .set({
        title: post.title,
        content,
        language: post.language as "en" | "fa",
        status,
        sourceType,
        updatedAt: new Date(),
        indexedAt: null,
        chunkCount: 0,
        embeddingProvider: null,
        embeddingModel: null,
        embeddingDimensions: null,
      })
      .where(eq(knowledgeDocuments.id, doc.id));
    if (status === "active") {
      await indexDocument(doc.id, "sync-post-update");
    }
  } else {
    const inserted = await c.db
      .insert(knowledgeDocuments)
      .values({
        title: post.title,
        content,
        language: post.language as "en" | "fa",
        status,
        sourceType,
        postId: post.id,
        author: post.authorName,
      })
      .returning();
    if (inserted[0] && status === "active") {
      await indexDocument(inserted[0].id, "sync-post-create");
    }
  }
}

export async function getKnowledgeDocumentByPostId(postId: string) {
  const c = await getDb();
  const rows = await c.db.select(DOC_FIELDS).from(knowledgeDocuments).where(eq(knowledgeDocuments.postId, postId)).limit(1);
  return rows[0];
}
