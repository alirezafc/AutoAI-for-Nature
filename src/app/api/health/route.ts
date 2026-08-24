import { NextResponse } from "next/server";
import { getDbMode } from "@/db/client";
import { getVectorStats } from "@/lib/rag";
import { getProviders } from "@/lib/ai/registry";
import { getAiConnections } from "@/lib/services/ai-connections";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbMode = await getDbMode();
  const stats = await getVectorStats().catch(() => ({ documents: 0, chunks: 0 }));
  const allProviders = getProviders().map((p) => ({
    key: p.key,
    name: p.name,
    configured: p.isConfigured(),
  }));
  const configuredProviders = allProviders.filter((p) => p.configured).map((p) => p.key);
  const hasRealProvider = configuredProviders.some((k) => k !== "mock");

  const connections = await getAiConnections().catch(() => null);
  const embedding =
    connections && connections.embeddingProvider !== "mock"
      ? { provider: connections.embeddingProvider, model: connections.embeddingModel }
      : null;
  const hasRealEmbedding = Boolean(embedding && embedding.provider !== "mock");

  // LIVE AI only when BOTH the LLM and the embedding model are real. If either
  // is the mock (or missing), the platform is in DEMO MODE.
  const mode = hasRealProvider && hasRealEmbedding ? "live" : "demo";

  return NextResponse.json({
    ok: true,
    name: "AutoAI",
    version: "1.0.0",
    time: new Date().toISOString(),
    database: {
      mode: dbMode,
      knowledgeDocuments: stats.documents,
      knowledgeChunks: stats.chunks,
    },
    ai: {
      mode,
      configuredProviders,
      allProviders,
      embedding,
    },
  });
}