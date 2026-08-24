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
import { workflows } from "./workflows";

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    error: text("error"),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("workflow_runs_workflow_idx").on(t.workflowId)]
);

export const backups = pgTable(
  "backups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    postCount: integer("post_count").notNull().default(0),
    size: integer("size").notNull().default(0),
    content: jsonb("content").$type<unknown>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("backups_created_idx").on(t.createdAt)]
);

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type Backup = typeof backups.$inferSelect;
export type NewBackup = typeof backups.$inferInsert;
