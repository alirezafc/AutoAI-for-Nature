import { NextResponse } from "next/server";
import { startArticleRun } from "@/lib/agents/engine";
import { listRuns } from "@/lib/services/agent-runs";
import { listCategories } from "@/lib/services/categories";
import { isAiNotConfiguredError } from "@/lib/ai/production-guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const topic = String(body?.topic ?? "").trim();
  const language = body?.language === "fa" ? "fa" : "en";
  const categoryId = typeof body?.categoryId === "string" ? body.categoryId : undefined;

  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  if (topic.length > 200) {
    return NextResponse.json({ error: "topic too long" }, { status: 400 });
  }

  try {
    const { runId, postId } = await startArticleRun({ topic, language, categoryId });
    return NextResponse.json({ runId, postId, status: "queued" }, { status: 202 });
  } catch (err) {
    if (isAiNotConfiguredError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));
  const runs = await listRuns(limit);
  return NextResponse.json(
    { runs },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}
