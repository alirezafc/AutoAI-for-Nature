import { NextResponse } from "next/server";
import { reindexAllDetailed } from "@/lib/rag";

export const dynamic = "force-dynamic";

/**
 * Re-index the ENTIRE knowledge base with the currently configured embedding
 * provider/model. All existing vectors are wiped before rebuilding, so vectors
 * from a previous embedding model can never be mixed with new ones.
 */
export async function POST() {
  const report = await reindexAllDetailed("admin-reindex-all");
  return NextResponse.json({ ok: report.success, ...report });
}