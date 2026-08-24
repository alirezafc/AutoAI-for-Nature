import { auditLogs } from "@/db/schema";
import { getDb } from "@/db/client";
import { desc } from "drizzle-orm";

export interface AuditEntry {
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const c = await getDb();
    await c.db.insert(auditLogs).values({
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    console.warn("audit write failed", err);
  }
}

export async function listAuditLogs(limit = 200): Promise<
  (typeof auditLogs.$inferSelect)[]
> {
  const c = await getDb();
  return c.db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}
