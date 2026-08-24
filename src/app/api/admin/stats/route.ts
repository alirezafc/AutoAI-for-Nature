import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { posts, agentRuns, conversations, knowledgeDocuments } from "@/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { getPostStats, getRecentAiRuns } from "@/lib/services/posts";
import { getVectorStats } from "@/lib/rag";
import { countRagQueries } from "@/lib/services/conversations";
import { countAgentRuns } from "@/lib/services/agent-runs";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await getDb();
  const [postStats, vectorStats, recentRuns, ragQueries, agentRunStats] = await Promise.all([
    getPostStats(),
    getVectorStats(),
    getRecentAiRuns(8),
    countRagQueries().catch(() => 0),
    countAgentRuns().catch(() => ({ total: 0, succeeded: 0, failed: 0, avgDurationMs: 0 })),
  ]);

  const statusCounts = await c.db
    .select({ status: posts.status, value: count() })
    .from(posts)
    .groupBy(posts.status);

  const convCount = await c.db.select({ value: count() }).from(conversations);
  const docCount = await c.db.select({ value: count() }).from(knowledgeDocuments);

  const latestRuns = await c.db
    .select({ status: agentRuns.status, value: count() })
    .from(agentRuns)
    .groupBy(agentRuns.status);

  return NextResponse.json({
    stats: {
      posts: postStats,
      statusCounts,
      conversations: Number(convCount[0]?.value ?? 0),
      knowledgeDocuments: Number(docCount[0]?.value ?? 0),
      vectorStats,
      ragQueries,
      agentRuns: { total: agentRunStats.total, succeeded: agentRunStats.succeeded, failed: agentRunStats.failed, avgDurationMs: agentRunStats.avgDurationMs, byStatus: latestRuns },
    },
    recentRuns,
  });
}
