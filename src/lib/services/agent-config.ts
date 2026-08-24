import { eq, desc } from "drizzle-orm";
import { agentConfigs, agentPromptVersions, lessons } from "@/db/schema";
import { getDb } from "@/db/client";
import { defaultPromptFor } from "@/lib/agents/prompts";
import { logAudit } from "./audit";

export async function listAgentConfigs() {
  const c = await getDb();
  return c.db.select().from(agentConfigs).orderBy(agentConfigs.key);
}

export async function getAgentConfig(key: string) {
  const c = await getDb();
  const rows = await c.db.select().from(agentConfigs).where(eq(agentConfigs.key, key)).limit(1);
  return rows[0] ?? null;
}

export async function ensureAgentConfigs(actor = "system"): Promise<void> {
  const c = await getDb();
  const existing = await c.db.select().from(agentConfigs);
  const byKey = new Map(existing.map((x) => [x.key, x]));
  for (const def of AGENT_DEFAULTS) {
    const current = byKey.get(def.key);
    if (current) continue;
    const [row] = await c.db
      .insert(agentConfigs)
      .values({
        key: def.key,
        name: def.name,
        description: def.description,
        enabled: true,
        prompt: def.prompt,
        temperature: def.temperature,
        maxTokens: def.maxTokens,
        version: 1,
      })
      .returning();
    await c.db.insert(agentPromptVersions).values({
      configId: row.id,
      version: 1,
      content: def.prompt,
      author: actor,
    });
  }
}

export interface AgentConfigUpdate {
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
  enabled?: boolean;
}

export async function updateAgentConfig(key: string, update: AgentConfigUpdate, actor = "admin") {
  const c = await getDb();
  const current = await getAgentConfig(key);
  if (!current) throw new Error(`Agent config not found: ${key}`);

  const nextVersion = current.version + 1;
  const [row] = await c.db
    .update(agentConfigs)
    .set({
      ...(update.prompt !== undefined ? { prompt: update.prompt } : {}),
      ...(update.temperature !== undefined ? { temperature: update.temperature } : {}),
      ...(update.maxTokens !== undefined ? { maxTokens: update.maxTokens } : {}),
      ...(update.enabled !== undefined ? { enabled: update.enabled } : {}),
      version: nextVersion,
      updatedAt: new Date(),
    })
    .where(eq(agentConfigs.key, key))
    .returning();

  if (update.prompt !== undefined && update.prompt !== current.prompt) {
    await c.db.insert(agentPromptVersions).values({
      configId: current.id,
      version: nextVersion,
      content: update.prompt,
      author: actor,
    });
  }

  await logAudit({ actor, action: "agent.prompt_updated", target: key, metadata: { version: nextVersion } });
  return row;
}

export async function listPromptVersions(configId: string) {
  const c = await getDb();
  return c.db
    .select()
    .from(agentPromptVersions)
    .where(eq(agentPromptVersions.configId, configId))
    .orderBy(desc(agentPromptVersions.version));
}

export async function rollbackPrompt(configId: string, version: number, actor = "admin") {
  const c = await getDb();
  const versions = await listPromptVersions(configId);
  const target = versions.find((v) => v.version === version);
  const config = await c.db.select().from(agentConfigs).where(eq(agentConfigs.id, configId)).limit(1);
  if (!target || !config[0]) throw new Error("Prompt version not found");
  const currentVersion = config[0].version;
  const nextVersion = currentVersion + 1;
  await c.db
    .update(agentConfigs)
    .set({ prompt: target.content, version: nextVersion, updatedAt: new Date() })
    .where(eq(agentConfigs.id, configId));
  await c.db.insert(agentPromptVersions).values({
    configId,
    version: nextVersion,
    content: target.content,
    author: `${actor} (rollback to v${version})`,
  });
  await logAudit({ actor, action: "agent.prompt_rolled_back", target: config[0].key, metadata: { version: target.version } });
}

export async function listActiveLessons(agent?: string): Promise<{ lesson: string; reason: string }[]> {
  const c = await getDb();
  const rows = agent
    ? await c.db.select().from(lessons).where(eq(lessons.agent, agent))
    : await c.db.select().from(lessons);
  return rows
    .filter((l) => l.status === "active" && l.approved)
    .map((l) => ({ lesson: l.lesson, reason: l.reason }));
}

const AGENT_DEFAULTS = [
  "idea",
  "strategist",
  "researcher",
  "writer",
  "critic",
  "seo",
  "publisher",
  "final_critic",
  "lessons",
].map((key) => {
  const def = defaultPromptFor(key)!;
  return {
    key: def.key,
    name: def.name,
    description: def.description,
    prompt: def.prompt,
    temperature: def.temperature,
    maxTokens: def.maxTokens,
  };
});
