import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    language: text("language").notNull().default("en"),
    provider: text("provider"),
    model: text("model"),
    latency: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("conversations_created_idx").on(t.createdAt)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    sources: jsonb("sources").$type<
      { title: string; id: string; type: string }[]
    >().notNull().default([]),
    provider: text("provider"),
    model: text("model"),
    latency: integer("latency_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
