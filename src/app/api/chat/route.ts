import { NextResponse } from "next/server";
import { getChatReply } from "@/lib/services/chat";
import { listConversations, getConversationWithMessages, deleteConversation } from "@/lib/services/conversations";
import { logger } from "@/lib/logging";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const question = String(body?.question ?? "").trim();
  const language = body?.language === "fa" ? "fa" : "en";
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : undefined;

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (question.length > 4000) {
    return NextResponse.json({ error: "question too long" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let runId = `chat-${Date.now()}`;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // client disconnected
        }
      };
      try {
        const result = await getChatReply({
          conversationId,
          question,
          language,
          onChunk: (chunk) => send({ type: "chunk", text: chunk }),
        });
        runId = `chat-${result.provider}/${result.model}`;
        send({
          type: "done",
          text: result.text,
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          sources: result.sources,
          hasRelevant: result.hasRelevant,
          fallbackUsed: result.fallbackUsed,
          conversationId: result.conversationId,
        });
      } catch (err) {
        logger.error(`chat failed: ${err instanceof Error ? err.message : String(err)}`);
        send({ type: "error", error: err instanceof Error ? err.message : "Chat failed" });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const full = await getConversationWithMessages(id);
    if (!full) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    return NextResponse.json({ conversation: full });
  }
  const convos = await listConversations(50);
  const list = await Promise.all(
    convos.map(async (c) => {
      const full = await getConversationWithMessages(c.id);
      const firstUser = (full?.messages ?? []).find((m) => m.role === "user");
      return {
        id: c.id,
        language: c.language,
        createdAt: c.createdAt,
        preview: firstUser?.content.slice(0, 120) ?? "",
        messageCount: full?.messages.length ?? 0,
      };
    })
  );
  return NextResponse.json({ conversations: list });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteConversation(id);
  return NextResponse.json({ ok: true });
}
