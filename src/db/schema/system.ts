import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actor: text("actor").notNull().default("system"),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)]
);

export const systemSettings = pgTable(
  "system_settings",
  {
    key: text("key").notNull().primaryKey(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;
