import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { posts } from "./content";

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runType: text("run_type").notNull().default("article_creation"),
    status: text("status").notNull().default("queued"),
    language: text("language").notNull().default("en"),
    topic: text("topic").notNull().default(""),
    categoryId: uuid("category_id"),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    error: text("error"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_runs_status_idx").on(t.status),
    index("agent_runs_created_idx").on(t.createdAt),
  ]
);

export const agentSteps = pgTable(
  "agent_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    agent: text("agent").notNull(),
    status: text("status").notNull().default("queued"),
    provider: text("provider"),
    model: text("model"),
    revision: integer("revision").notNull().default(0),
    retries: integer("retries").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    inputSummary: text("input_summary").notNull().default(""),
    outputSummary: text("output_summary").notNull().default(""),
    output: jsonb("output").$type<unknown>().notNull().default({}),
    score: integer("score"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_steps_run_idx").on(t.runId),
  ]
);

export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    prompt: text("prompt").notNull().default(""),
    temperature: integer("temperature").notNull().default(70),
    maxTokens: integer("max_tokens").notNull().default(2048),
    modelConfig: jsonb("model_config").$type<{
      provider?: string;
      model?: string;
      fallbackProvider?: string;
      fallbackModel?: string;
    }>().notNull().default({}),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_configs_key_idx").on(t.key)]
);

export const agentPromptVersions = pgTable(
  "agent_prompt_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    configId: uuid("config_id")
      .notNull()
      .references(() => agentConfigs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    author: text("author").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_prompt_versions_config_idx").on(t.configId)]
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agent: text("agent").notNull(),
    lesson: text("lesson").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("active"),
    approved: boolean("approved").notNull().default(true),
    sourceRunId: uuid("source_run_id"),
    sourceFeedbackId: uuid("source_feedback_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("lessons_agent_idx").on(t.agent),
    index("lessons_status_idx").on(t.status),
  ]
);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(),
    comment: text("comment").notNull().default(""),
    processedAsLesson: boolean("processed_as_lesson").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("feedback_post_idx").on(t.postId)]
);

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentStep = typeof agentSteps.$inferSelect;
export type NewAgentStep = typeof agentSteps.$inferInsert;
export type AgentConfig = typeof agentConfigs.$inferSelect;
export type NewAgentConfig = typeof agentConfigs.$inferInsert;
export type AgentPromptVersion = typeof agentPromptVersions.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
