import { NextResponse } from "next/server";
import { getPost } from "@/lib/services/posts";
import { getRunWithSteps } from "@/lib/services/agent-runs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  let run = null;
  if (post.agentRunId) {
    const fullRun = await getRunWithSteps(post.agentRunId);
    if (fullRun) {
      run = {
        id: fullRun.id,
        status: fullRun.status,
        topic: fullRun.topic,
        language: fullRun.language,
        runType: fullRun.runType,
        createdAt: fullRun.createdAt,
        startedAt: fullRun.startedAt,
        finishedAt: fullRun.finishedAt,
        durationMs: fullRun.durationMs,
        steps: fullRun.steps,
      };
    }
  }

  return NextResponse.json({ post, run, revisions: [] });
}