import { NextResponse } from "next/server";
import { indexDocument } from "@/lib/rag";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await indexDocument(id, `admin-reindex-${id}`);
  return NextResponse.json({ ok: true, ...result });
}
