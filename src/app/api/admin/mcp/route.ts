import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { mcpHosts, mcpTools } from "@/db/schema";
import { listMcpInvocations } from "@/lib/services/mcp-log";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await getDb();
  const [hosts, tools, invocations] = await Promise.all([
    c.db.select().from(mcpHosts).orderBy(asc(mcpHosts.createdAt)),
    c.db.select().from(mcpTools).orderBy(asc(mcpTools.createdAt)),
    listMcpInvocations(100),
  ]);
  return NextResponse.json({ hosts, tools, invocations });
}

export async function POST(req: Request) {
  const c = await getDb();
  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const [host] = await c.db
    .insert(mcpHosts)
    .values({
      name: String(body.name),
      type: String(body.type ?? "cursor"),
      endpoint: body.endpoint ? String(body.endpoint) : null,
      authConfig: body.authConfig ?? {},
      status: "unknown",
    })
    .returning();
  return NextResponse.json({ host }, { status: 201 });
}

export async function PATCH(req: Request) {
  const c = await getDb();
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.type !== undefined) patch.type = String(body.type);
  if (body.endpoint !== undefined) patch.endpoint = body.endpoint ? String(body.endpoint) : null;
  if (body.status !== undefined) patch.status = String(body.status);
  const [host] = await c.db.update(mcpHosts).set(patch).where(eq(mcpHosts.id, String(body.id))).returning();
  return NextResponse.json({ host });
}

export async function DELETE(req: Request) {
  const c = await getDb();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await c.db.delete(mcpHosts).where(eq(mcpHosts.id, id));
  return NextResponse.json({ ok: true });
}
