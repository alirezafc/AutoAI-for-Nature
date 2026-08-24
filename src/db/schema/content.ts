import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameFa: text("name_fa").notNull(),
    descriptionEn: text("description_en").notNull().default(""),
    descriptionFa: text("description_fa").notNull().default(""),
    color: text("color").notNull().default("#16a34a"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug)]
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    content: text("content").notNull().default(""),
    language: text("language").notNull().default("en"),
    status: text("status").notNull().default("draft"),
    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    coverImage: text("cover_image").notNull().default(""),
    seo: jsonb("seo").$type<{
      metaTitle?: string;
      metaDescription?: string;
      keywords?: string[];
      faq?: { question: string; answer: string }[];
      structuredData?: Record<string, unknown>;
    }>().notNull().default({}),
    wordCount: integer("word_count").notNull().default(0),
    authorName: text("author_name").notNull().default("AutoAI"),
    agentRunId: uuid("agent_run_id"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewReason: text("review_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("posts_slug_idx").on(t.slug),
    index("posts_status_idx").on(t.status),
    index("posts_language_idx").on(t.language),
    index("posts_category_idx").on(t.categoryId),
    index("posts_published_idx").on(t.publishedAt),
  ]
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    label: text("label").notNull().default("Edited by human"),
    actor: text("actor").notNull().default("admin"),
    title: text("title"),
    excerpt: text("excerpt"),
    content: text("content"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("post_revisions_post_idx").on(t.postId)]
);

export type PostRevision = typeof postRevisions.$inferSelect;
export type NewPostRevision = typeof postRevisions.$inferInsert;
