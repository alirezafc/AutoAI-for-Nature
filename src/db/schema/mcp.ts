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

export const mcpHosts = pgTable(
  "mcp_hosts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull().default("cursor"),
    endpoint: text("endpoint"),
    authConfig: jsonb("auth_config").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("unknown"),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mcp_hosts_type_idx").on(t.type)]
);

export const mcpTools = pgTable(
  "mcp_tools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(),
    description: text("description").notNull(),
    readOnly: boolean("read_only").notNull().default(true),
    invocationsCount: integer("invocations_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mcp_tools_name_idx").on(t.name)]
);

export const mcpInvocations = pgTable(
  "mcp_invocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tool: text("tool").notNull(),
    host: text("host").notNull().default("unknown"),
    status: text("status").notNull().default("success"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    paramsSummary: text("params_summary").notNull().default(""),
    error: text("error"),
  },
  (t) => [index("mcp_invocations_tool_idx").on(t.tool)]
);

export type McpHost = typeof mcpHosts.$inferSelect;
export type NewMcpHost = typeof mcpHosts.$inferInsert;
export type McpTool = typeof mcpTools.$inferSelect;
export type McpInvocation = typeof mcpInvocations.$inferSelect;
export type NewMcpInvocation = typeof mcpInvocations.$inferInsert;
