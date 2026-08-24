import { desc, eq } from "drizzle-orm";
import { backups } from "@/db/schema";
import { getDb } from "@/db/client";
import { listPosts } from "./posts";
import { listCategories } from "./categories";
import { listConversations } from "./conversations";
import { listAuditLogs } from "./audit";
import { getAllSettings } from "./system-settings";

export interface BackupBundle {
  exportedAt: string;
  version: 1;
  counts: Record<string, number>;
  posts: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  conversations: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  backupId?: string;
  filename?: string;
}

export async function createBackup(): Promise<BackupBundle> {
  const [posts, categories, conversations, auditLogs, settings] = await Promise.all([
    listPosts({ limit: 10000 }),
    listCategories(),
    listConversations(10000),
    listAuditLogs(10000),
    getAllSettings(),
  ]);

  const bundle: BackupBundle = {
    exportedAt: new Date().toISOString(),
    version: 1,
    counts: {
      posts: posts.length,
      categories: categories.length,
      conversations: conversations.length,
      auditLogs: auditLogs.length,
      settings: Object.keys(settings).length,
    },
    posts,
    categories,
    conversations,
    auditLogs,
    settings,
  };

  const c = await getDb();
  const content = JSON.stringify(bundle);
  const [row] = await c.db
    .insert(backups)
    .values({
      filename: `autoai-backup-${new Date().toISOString().slice(0, 10)}.json`,
      postCount: posts.length,
      size: Buffer.byteLength(content, "utf8"),
      content,
    })
    .returning();

  return { ...bundle, backupId: row.id, filename: row.filename };
}

export async function listBackups(limit = 20) {
  const c = await getDb();
  const rows = await c.db
    .select({
      id: backups.id,
      workflowRunId: backups.workflowRunId,
      filename: backups.filename,
      postCount: backups.postCount,
      size: backups.size,
      createdAt: backups.createdAt,
    })
    .from(backups)
    .orderBy(desc(backups.createdAt))
    .limit(limit);
  return rows;
}

export async function getBackup(id: string) {
  const c = await getDb();
  const rows = await c.db.select().from(backups).where(eq(backups.id, id)).limit(1);
  return rows[0];
}
