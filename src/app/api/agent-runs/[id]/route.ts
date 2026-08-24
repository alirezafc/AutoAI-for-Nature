import { NextResponse } from "next/server";
import { getRunWithSteps } from "@/lib/services/agent-runs";
import { startArticleRun } from "@/lib/agents/engine";
import { isAiNotConfiguredError } from "@/lib/ai/production-guard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRunWithSteps(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  // Run state changes constantly during execution — never cacheable.
  return NextResponse.json(
    { run },
    { headers: { "Cache-Control": "no-store, must-revalidate" } }
  );
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getRunWithSteps(id);
  if (!existing) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (existing.status === "running" || existing.status === "queued") {
    return NextResponse.json({ error: "Run is already active" }, { status: 409 });
  }

  const topic = (existing.topic || "")
    .replace(/^The story of\s+/i, "")
    .replace(/\s*[—-]\s*idea\s*\d+$/i, "")
    .trim();
  try {
    const { runId, postId } = await startArticleRun({
      topic: topic || existing.topic,
      language: existing.language === "fa" ? "fa" : "en",
      categoryId: existing.categoryId,
    });
    return NextResponse.json({ runId, postId, retriedFrom: id, status: "queued" }, { status: 202 });
  } catch (err) {
    if (isAiNotConfiguredError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }
}
