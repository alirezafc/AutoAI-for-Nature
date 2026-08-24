import { NextResponse } from "next/server";
import { createBackup, listBackups, getBackup } from "@/lib/services/backups";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const backup = await getBackup(id);
    if (!backup) return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    const parsed =
      typeof backup.content === "string" ? JSON.parse(backup.content as string) : backup.content;
    return NextResponse.json(parsed);
  }
  return NextResponse.json({ backups: await listBackups(20) });
}

export async function POST() {
  try {
    const bundle = await createBackup();
    return NextResponse.json({ ok: true, ...bundle }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed" },
      { status: 500 }
    );
  }
}
