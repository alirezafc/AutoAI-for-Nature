import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    schedule: text("schedule").notNull().default("0 0 * * *"),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("workflows_key_idx").on(t.key)]
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
