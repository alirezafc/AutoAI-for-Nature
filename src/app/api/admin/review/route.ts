import { NextResponse } from "next/server";
import { approveArticle, rejectArticle, regenerateArticle } from "@/lib/services/review";
import { listPostRevisions } from "@/lib/services/posts";
import { isAiNotConfiguredError } from "@/lib/ai/production-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("postId");
  if (!id) return NextResponse.json({ error: "postId required" }, { status: 400 });
  const revisions = await listPostRevisions(id);
  return NextResponse.json({ revisions });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.postId || !body?.action) {
    return NextResponse.json({ error: "postId and action required" }, { status: 400 });
  }
  const action = String(body.action);

  try {
    switch (action) {
      case "approve": {
        const result = await approveArticle(String(body.postId));
        return NextResponse.json({ ok: true, ...result });
      }
      case "reject": {
        const reason = String(body.reason ?? "").trim();
        if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 400 });
        const result = await rejectArticle(String(body.postId), reason);
        return NextResponse.json({ ok: true, ...result });
      }
      case "regenerate": {
        const result = await regenerateArticle(String(body.postId), {
          language: body.language === "fa" ? "fa" : "en",
        });
        return NextResponse.json({ ok: true, ...result });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    if (isAiNotConfiguredError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Review failed" }, { status: 500 });
  }
}