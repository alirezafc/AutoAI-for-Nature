import { NextResponse } from "next/server";
import { listWorkflows, listWorkflowRuns, createWorkflow, updateWorkflow, deleteWorkflow, runWorkflow } from "@/lib/services/workflows";

export const dynamic = "force-dynamic";

export async function GET() {
  const [workflows, runs] = await Promise.all([listWorkflows(), listWorkflowRuns(25)]);
  return NextResponse.json({ workflows, runs });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "run") {
    const key = String(body?.key ?? "");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    try {
      const result = await runWorkflow(key);
      return NextResponse.json({ ok: result.status === "success", ...result });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const workflow = await createWorkflow({
    key: body?.key ? String(body.key) : undefined,
    name: body?.name ? String(body.name) : undefined,
    description: body?.description !== undefined ? String(body.description) : undefined,
    schedule: body?.schedule ? String(body.schedule) : undefined,
    enabled: body?.enabled !== undefined ? Boolean(body.enabled) : undefined,
  });
  return NextResponse.json({ workflow }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const workflow = await updateWorkflow(String(body.id), {
    name: body.name !== undefined ? String(body.name) : undefined,
    description: body.description !== undefined ? String(body.description) : undefined,
    schedule: body.schedule !== undefined ? String(body.schedule) : undefined,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : undefined,
  });
  return NextResponse.json({ workflow });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await deleteWorkflow(id);
  return NextResponse.json({ ok: true });
}
