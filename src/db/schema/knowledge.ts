import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { vector, EMBEDDING_DIMENSIONS } from "./common";

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    language: text("language").notNull().default("en"),
    status: text("status").notNull().default("active"),
    sourceType: text("source_type").notNull().default("curated"),
    postId: uuid("post_id"),
    author: text("author").notNull().default("AutoAI"),
    chunkCount: integer("chunk_count").notNull().default(0),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    embeddingProvider: text("embedding_provider"),
    embeddingModel: text("embedding_model"),
    embeddingDimensions: integer("embedding_dimensions"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("knowledge_docs_status_idx").on(t.status),
    index("knowledge_docs_language_idx").on(t.language),
    index("knowledge_docs_source_idx").on(t.sourceType),
  ]
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    language: text("language").notNull().default("en"),
    embedding: vector(EMBEDDING_DIMENSIONS)("embedding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("knowledge_chunks_doc_idx").on(t.documentId),
    index("knowledge_chunks_language_idx").on(t.language),
  ]
);

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
