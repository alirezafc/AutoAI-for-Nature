import { NextResponse } from "next/server";
import { listAuditLogs } from "@/lib/services/audit";
import { listBackups } from "@/lib/services/backups";
import { listWorkflowRuns } from "@/lib/services/workflows";
import { listMcpInvocations } from "@/lib/services/mcp-log";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "audit";
  if (kind === "backups") return NextResponse.json({ backups: await listBackups(30) });
  if (kind === "workflows") return NextResponse.json({ runs: await listWorkflowRuns(30) });
  if (kind === "mcp") return NextResponse.json({ invocations: await listMcpInvocations(100) });
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
  return NextResponse.json({ logs: await listAuditLogs(limit) });
}
