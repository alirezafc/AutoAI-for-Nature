import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { agentRuns, agentSteps, posts } from "@/db/schema";
import { getDb } from "@/db/client";
import { slugify } from "@/lib/utils";
import { logAudit } from "./audit";

export type StepStatus = "queued" | "running" | "completed" | "failed" | "skipped";
export type RunStatus = "queued" | "running" | "waiting_for_human" | "completed" | "failed" | "cancelled";

export async function createRun(input: {
  topic: string;
  language: "en" | "fa";
  categoryId?: string | null;
  runType?: string;
  postId?: string;
}) {
  const c = await getDb();
  const [run] = await c.db
    .insert(agentRuns)
    .values({
      runType: input.runType ?? "article_creation",
      status: "queued",
      language: input.language,
      topic: input.topic,
      categoryId: input.categoryId ?? null,
      postId: input.postId ?? null,
      config: {},
    })
    .returning();

  // A draft post is created up-front so human-in-the-loop has a target.
  // When a regeneration targets an existing post, reuse it instead.
  let postId = input.postId ?? null;
  let post = null;
  if (!postId) {
    const [draft] = await c.db
      .insert(posts)
      .values({
        slug: slugify(input.topic) || "draft",
        title: input.topic,
        content: "",
        excerpt: "",
        language: input.language,
        status: "draft",
        isAiGenerated: true,
        categoryId: input.categoryId ?? null,
        agentRunId: run.id,
        authorName: "AutoAI",
        seo: {},
      })
      .returning();
    post = draft;
    postId = draft.id;
  } else {
    const [existing] = await c.db
      .update(posts)
      .set({ agentRunId: run.id })
      .where(eq(posts.id, postId))
      .returning();
    post = existing;
  }

  await c.db
    .update(agentRuns)
    .set({ postId, config: { postId, regenerated: Boolean(input.postId) } })
    .where(eq(agentRuns.id, run.id));

  await logAudit({ actor: "system", action: "agent_run.created", target: run.id, metadata: { topic: input.topic, language: input.language } });
  return { run: { ...run, postId }, post };
}

export async function getRunWithSteps(id: string) {
  const c = await getDb();
  const runs = await c.db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
  if (!runs[0]) return null;
  const steps = await c.db
    .select()
    .from(agentSteps)
    .where(eq(agentSteps.runId, id))
    .orderBy(agentSteps.createdAt);
  return { ...runs[0], steps };
}

export async function listRuns(limit = 30) {
  const c = await getDb();
  const runs = await c.db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(limit);
  const allSteps = await c.db
    .select({ runId: agentSteps.runId, agent: agentSteps.agent, status: agentSteps.status, score: agentSteps.score, revision: agentSteps.revision })
    .from(agentSteps);
  const byRun = new Map<string, { agent: string; status: string; score: number | null; revision: number }[]>();
  for (const s of allSteps) {
    const list = byRun.get(s.runId) ?? [];
    list.push({ agent: s.agent, status: s.status, score: s.score, revision: s.revision });
    byRun.set(s.runId, list);
  }
  return runs.map((r) => ({ ...r, steps: byRun.get(r.id) ?? [] }));
}

export async function createStep(runId: string, agent: string, revision = 0) {
  const c = await getDb();
  const [step] = await c.db
    .insert(agentSteps)
    .values({ runId, agent, status: "queued", revision })
    .returning();
  return step;
}

export async function updateStep(
  stepId: string,
  patch: {
    status?: StepStatus;
    provider?: string;
    model?: string;
    startedAt?: Date;
    finishedAt?: Date;
    durationMs?: number;
    inputSummary?: string;
    outputSummary?: string;
    output?: unknown;
    score?: number | null;
    retries?: number;
    error?: string | null;
  }
) {
  const c = await getDb();
  const [step] = await c.db
    .update(agentSteps)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
      ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
      ...(patch.durationMs !== undefined ? { durationMs: patch.durationMs } : {}),
      ...(patch.inputSummary !== undefined ? { inputSummary: patch.inputSummary } : {}),
      ...(patch.outputSummary !== undefined ? { outputSummary: patch.outputSummary } : {}),
      ...(patch.output !== undefined ? { output: patch.output } : {}),
      ...(patch.score !== undefined ? { score: patch.score } : {}),
      ...(patch.retries !== undefined ? { retries: patch.retries } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .where(eq(agentSteps.id, stepId))
    .returning();
  return step;
}

export async function updateRun(
  runId: string,
  patch: {
    status?: RunStatus;
    startedAt?: Date;
    finishedAt?: Date;
    durationMs?: number;
    error?: string | null;
  }
) {
  const c = await getDb();
  const [run] = await c.db
    .update(agentRuns)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
      ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
      ...(patch.durationMs !== undefined ? { durationMs: patch.durationMs } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    })
    .where(eq(agentRuns.id, runId))
    .returning();
  return run;
}

/**
 * Terminal failure for a run. Also sweeps any steps still marked queued or
 * running to failed — after the worker terminated, no step may remain
 * "running" (BUG #4/#5: DB is the single source of truth; no zombie states).
 */
export async function failRun(runId: string, error: string): Promise<void> {
  const c = await getDb();
  const started = await getRunWithSteps(runId);
  const duration = started?.startedAt ? Date.now() - new Date(started.startedAt).getTime() : undefined;
  await c.db
    .update(agentRuns)
    .set({ status: "failed", error, finishedAt: new Date(), durationMs: duration })
    .where(eq(agentRuns.id, runId));
  await c.db
    .update(agentSteps)
    .set({
      status: "failed",
      error: sql`COALESCE(${agentSteps.error}, ${error.slice(0, 500)})`,
      finishedAt: new Date(),
    })
    .where(and(eq(agentSteps.runId, runId), inArray(agentSteps.status, ["queued", "running"])));
}

/**
 * Pure selector for runs that must leave "waiting_for_human" when their post
 * reaches a terminal human decision (approved/published or rejected).
 *
 * A post can own MULTIPLE runs: every regeneration creates a new run for the
 * same postId and re-points posts.agentRunId to it. Finalizing only the
 * currently-linked run leaves older runs stuck as waiting_for_human forever,
 * which is exactly the production inconsistency this fixes.
 */
export function selectRunsToFinalize<T extends { id: string; postId: string | null; status: string }>(
  runs: T[],
  postId: string
): T[] {
  return runs.filter((r) => r.postId === postId && r.status === "waiting_for_human");
}

/**
 * Transition EVERY waiting_for_human run linked to this post to the terminal
 * "completed" state (existing architecture state — no new states invented).
 * Returns the ids of the finalized runs.
 */
export async function finalizeWaitingRunsForPost(postId: string): Promise<string[]> {
  const c = await getDb();
  const waiting = await c.db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.postId, postId), eq(agentRuns.status, "waiting_for_human")));
  if (waiting.length === 0) return [];
  const finishedAt = new Date();
  for (const run of waiting) {
    const duration = run.startedAt ? finishedAt.getTime() - new Date(run.startedAt).getTime() : undefined;
    await updateRun(run.id, { status: "completed", finishedAt, durationMs: duration });
  }
  return waiting.map((r) => r.id);
}

export async function setRunWaitingForHuman(runId: string): Promise<void> {
  await updateRun(runId, { status: "waiting_for_human" });
}

export async function markStepStarted(stepId: string): Promise<void> {
  await updateStep(stepId, { status: "running", startedAt: new Date() });
}

export async function markStepCompleted(
  stepId: string,
  patch: { provider: string; model: string; outputSummary: string; output: unknown; score?: number | null; retries?: number }
): Promise<void> {
  const c = await getDb();
  const rows = await c.db.select().from(agentSteps).where(eq(agentSteps.id, stepId)).limit(1);
  const started = rows[0];
  const duration = started?.startedAt ? Date.now() - new Date(started.startedAt).getTime() : undefined;
  await updateStep(stepId, {
    status: "completed",
    provider: patch.provider,
    model: patch.model,
    finishedAt: new Date(),
    durationMs: duration,
    outputSummary: patch.outputSummary,
    output: patch.output,
    score: patch.score,
    ...(patch.retries !== undefined ? { retries: patch.retries } : {}),
    error: null,
  });
}

export async function markStepFailed(
  stepId: string,
  error: string,
  patch: { provider?: string; model?: string; retries?: number } = {}
): Promise<void> {
  const c = await getDb();
  const rows = await c.db.select().from(agentSteps).where(eq(agentSteps.id, stepId)).limit(1);
  const started = rows[0];
  const duration = started?.startedAt ? Date.now() - new Date(started.startedAt).getTime() : undefined;
  await updateStep(stepId, {
    status: "failed",
    finishedAt: new Date(),
    durationMs: duration,
    error: error.slice(0, 2000),
    ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
    ...(patch.model !== undefined ? { model: patch.model } : {}),
    ...(patch.retries !== undefined ? { retries: patch.retries } : {}),
  });
}

export async function getStep(stepId: string) {
  const c = await getDb();
  const rows = await c.db.select().from(agentSteps).where(eq(agentSteps.id, stepId)).limit(1);
  return rows[0];
}

export async function countAgentRuns() {
  const c = await getDb();
  const rows = await c.db.select().from(agentRuns);
  const total = rows.length;
  const succeeded = rows.filter((r) => r.status === "completed").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const allSteps = await c.db.select().from(agentSteps);
  const durations = allSteps.filter((s) => s.durationMs != null).map((s) => s.durationMs as number);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  return { total, succeeded, failed, avgDurationMs: avg };
}
