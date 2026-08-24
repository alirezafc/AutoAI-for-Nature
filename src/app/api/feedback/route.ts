import { NextResponse } from "next/server";
import { feedback } from "@/db/schema";
import { getDb } from "@/db/client";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { postId?: string; rating?: string; comment?: string };
    if (!body.postId || !body.rating) {
      return NextResponse.json({ error: "postId and rating are required" }, { status: 400 });
    }
    const c = await getDb();
    await c.db.insert(feedback).values({
      postId: body.postId,
      rating: body.rating,
      comment: (body.comment ?? "").slice(0, 2000),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
