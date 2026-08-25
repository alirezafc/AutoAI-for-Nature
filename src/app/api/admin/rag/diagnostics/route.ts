import { NextResponse } from "next/server";
import { diagnoseRetrieval } from "@/lib/rag";

export const dynamic = "force-dynamic";

/**
 * Admin retrieval diagnosis (auth enforced by middleware): runs ONE real query
 * embedding through the configured provider and reports exactly where the RAG
 * candidate set shrinks — status filter, source-type filter, embedding
 * identity match, similarities vs threshold. Never exposes credentials.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const language = url.searchParams.get("language") === "fa" ? "fa" : url.searchParams.get("language") === "en" ? "en" : undefined;
  try {
    const diagnosis = await diagnoseRetrieval(q, { language });
    return NextResponse.json(diagnosis);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "diagnosis failed" },
      { status: 502 }
    );
  }
}
