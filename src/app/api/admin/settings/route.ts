import { NextResponse } from "next/server";
import { getAllSettings, setSetting, getDefaultSettings, type SettingsKey } from "@/lib/services/system-settings";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

const VALID_KEYS: SettingsKey[] = [
  "rag.sources",
  "rag.embedding",
  "rag.chunking",
  "rag.search",
  "agent.revision",
];

export async function GET() {
  const [settings, defaults] = await Promise.all([getAllSettings(), Promise.resolve(getDefaultSettings())]);
  return NextResponse.json({ settings, defaults });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const updated: string[] = [];
  for (const key of VALID_KEYS) {
    if (key in body) {
      await setSetting(key, (body as Record<string, unknown>)[key] as never);
      updated.push(key);
    }
  }
  if (updated.length === 0) {
    return NextResponse.json({ error: "no valid settings keys provided" }, { status: 400 });
  }
  await logAudit({ actor: "admin", action: "settings.updated", metadata: { keys: updated } });
  return NextResponse.json({ ok: true, updated });
}
