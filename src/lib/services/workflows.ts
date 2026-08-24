import { eq, desc, asc } from "drizzle-orm";
import { workflows, workflowRuns } from "@/db/schema";
import { getDb } from "@/db/client";
import { logger } from "@/lib/logging";
import { createBackup } from "./backups";
import { logAudit } from "./audit";

const log = logger;

const WORKFLOW_HANDLERS: Record<string, () => Promise<Record<string, unknown>>> = {
  "nightly-backup": async () => {
    const bundle = await createBackup();
    return {
      backupId: bundle.backupId,
      filename: bundle.filename,
      counts: bundle.counts,
    } as Record<string, unknown>;
  },
};

export interface WorkflowInput {
  key?: string;
  name?: string;
  description?: string;
  schedule?: string;
  enabled?: boolean;
}

export async function listWorkflows() {
  const c = await getDb();
  const rows = await c.db.select().from(workflows).orderBy(asc(workflows.createdAt));
  return rows;
}

export async function getWorkflowByKey(key: string) {
  const c = await getDb();
  const rows = await c.db.select().from(workflows).where(eq(workflows.key, key)).limit(1);
  return rows[0];
}

export async function createWorkflow(input: WorkflowInput) {
  const c = await getDb();
  const key = input.key ?? `wf-${Date.now()}`;
  const [row] = await c.db
    .insert(workflows)
    .values({
      key,
      name: input.name ?? key,
      description: input.description ?? "",
      schedule: input.schedule ?? "0 0 * * *",
      enabled: input.enabled ?? true,
      nextRunAt: nextCronRun(input.schedule ?? "0 0 * * *"),
    })
    .returning();
  await logAudit({ actor: "system", action: "workflow.create", metadata: { key: row.key } });
  return row;
}

export async function updateWorkflow(id: string, input: WorkflowInput) {
  const c = await getDb();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.schedule !== undefined) {
    patch.schedule = input.schedule;
    patch.nextRunAt = nextCronRun(input.schedule);
  }
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  const [row] = await c.db.update(workflows).set(patch).where(eq(workflows.id, id)).returning();
  await logAudit({ actor: "system", action: "workflow.update", metadata: { id } });
  return row;
}

export async function setWorkflowEnabled(id: string, enabled: boolean) {
  return updateWorkflow(id, { enabled });
}

export async function deleteWorkflow(id: string) {
  const c = await getDb();
  await c.db.delete(workflows).where(eq(workflows.id, id));
  await logAudit({ actor: "system", action: "workflow.delete", metadata: { id } });
}

export async function listWorkflowRuns(limit = 50) {
  const c = await getDb();
  const rows = await c.db.select().from(workflowRuns).orderBy(desc(workflowRuns.startedAt)).limit(limit);
  return rows;
}

export async function runWorkflow(key: string): Promise<{ runId: string; status: string; result: Record<string, unknown> }> {
  const c = await getDb();
  const wf = await getWorkflowByKey(key);
  if (!wf) {
    throw new Error(`Workflow not found: ${key}`);
  }

  const startedAt = new Date();
  const [run] = await c.db
    .insert(workflowRuns)
    .values({ workflowId: wf.id, status: "running", startedAt })
    .returning();

  let status = "success";
  let error: string | undefined;
  let result: Record<string, unknown> = {};

  try {
    const handler = WORKFLOW_HANDLERS[key];
    if (handler) {
      result = await handler();
    } else {
      result = { message: `No handler registered for workflow "${key}"` };
    }
    await logAudit({ actor: "system", action: "workflow.run", metadata: { key, runId: run.id } });
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    log.error(`workflow ${key} failed`, { error: err instanceof Error ? err.message : String(err) });
  }

  const finishedAt = new Date();
  await c.db
    .update(workflowRuns)
    .set({ status, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), error, result })
    .where(eq(workflowRuns.id, run.id));

  await c.db
    .update(workflows)
    .set({ lastRunAt: finishedAt, nextRunAt: nextCronRun(wf.schedule) })
    .where(eq(workflows.id, wf.id));

  return { runId: run.id, status, result };
}

export async function ensureDefaultWorkflow() {
  const existing = await getWorkflowByKey("nightly-backup");
  if (existing) return existing;
  return createWorkflow({
    key: "nightly-backup",
    name: "Nightly Backup",
    description: "Creates a full content backup every night at midnight.",
    schedule: "0 0 * * *",
    enabled: true,
  });
}

export function nextCronRun(schedule: string, from = new Date()): Date {
  const trimmed = schedule.trim().toLowerCase();
  if (trimmed === "daily") {
    const d = new Date(from);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (trimmed === "weekly") {
    const d = new Date(from);
    d.setDate(d.getDate() + 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) {
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    const dayOfMonth = parts[2];
    const month = parts[3];
    const dayOfWeek = parts[4];
    if (!isNaN(hour) && (dayOfMonth === "*" || dayOfMonth === "?") && (month === "*") && (dayOfWeek === "*")) {
      const d = new Date(from);
      d.setHours(hour, isNaN(minute) ? 0 : minute, 0, 0);
      if (d <= from) d.setDate(d.getDate() + 1);
      return d;
    }
    if (!isNaN(hour) && (dayOfMonth === "*" || dayOfMonth === "?") && (month === "*") && dayOfWeek !== "*") {
      const target = parseInt(dayOfWeek, 10); // 0 = sunday
      const d = new Date(from);
      let count = 0;
      while (count < 8) {
        d.setHours(hour, isNaN(minute) ? 0 : minute, 0, 0);
        if (d.getDay() === target && d > from) return d;
        d.setDate(d.getDate() + 1);
        count += 1;
      }
    }
  }
  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}
