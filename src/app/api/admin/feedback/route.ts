import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { feedback, lessons, posts } from "@/db/schema";
import { getDb } from "@/db/client";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await getDb();
  const fb = await c.db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(100);
  const lessonRows = await c.db.select().from(lessons).orderBy(desc(lessons.createdAt)).limit(100);
  return NextResponse.json({ feedback: fb, lessons: lessonRows });
}

export async function PATCH(req: Request) {
  const c = await getDb();
  const body = await req.json().catch(() => null);
  const id = body?.id ? String(body.id) : null;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const scope = body?.scope === "lesson" ? "lesson" : "feedback";

  if (scope === "lesson") {
    const action = String(body?.action ?? "");
    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
    }
    const [row] = await c.db
      .update(lessons)
      .set({ approved: action === "approve", status: action === "approve" ? "active" : "archived", updatedAt: new Date() })
      .where(eq(lessons.id, id))
      .returning();
    await logAudit({ actor: "admin", action: `lesson.${action}`, target: id });
    return NextResponse.json({ lesson: row });
  }

  // Feedback → create lesson (learn from user feedback)
  const [fb] = await c.db.select().from(feedback).where(eq(feedback.id, id)).limit(1);
  if (!fb) return NextResponse.json({ error: "feedback not found" }, { status: 404 });
  const post = fb.postId ? await c.db.select().from(posts).where(eq(posts.id, fb.postId)).limit(1).then((r) => r[0]) : null;
  const lessonText = `User feedback on "${post?.title ?? "a post"}": ${fb.comment || fb.rating}`;
  const [lesson] = await c.db
    .insert(lessons)
    .values({
      agent: "writer",
      lesson: lessonText,
      reason: "Derived from user feedback",
      status: "active",
      approved: false,
      sourceFeedbackId: fb.id,
    })
    .returning();
  await c.db.update(feedback).set({ processedAsLesson: true }).where(eq(feedback.id, id));
  await logAudit({ actor: "admin", action: "feedback.processed", target: id });
  return NextResponse.json({ lesson, feedback: { ...fb, processedAsLesson: true } });
}
