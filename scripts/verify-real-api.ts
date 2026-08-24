/**
 * Real-API end-to-end verification harness (requirement: actually execute real
 * OpenRouter requests — chat, embedding, RAG retrieval, article generation).
 *
 * Run with an OpenRouter key:
 *   OPENROUTER_API_KEY=sk-or-v1-... npx tsx scripts/verify-real-api.ts
 *
 * If the key is missing the script reports "skipped" and exits 0, so CI/local
 * stays green without burning tokens. When the key IS set it performs REAL
 * requests against OpenRouter and prints a JSON report.
 */
import { loadEnv } from "./env";
loadEnv();

import type { ModelPurpose } from "../src/lib/ai/types";

const KEY = process.env.OPENROUTER_API_KEY?.trim();

async function main() {
  if (!KEY) {
    console.log(JSON.stringify({ status: "skipped", reason: "OPENROUTER_API_KEY not set" }));
    process.exit(0);
  }

  const {
    saveAiConnections,
  } = await import("../src/lib/services/ai-connections");
  const { resetProviderCache } = await import("../src/lib/ai/registry");
  const { upsertModelConfig } = await import("../src/lib/services/model-config");
  const { routerChat, routerEmbedding } = await import("../src/lib/ai/router");
  const {
    createKnowledgeDocument,
    indexDocument,
    searchKnowledge,
    deleteKnowledgeDocument,
  } = await import("../src/lib/rag");
  const { startArticleRun, getRunForPolling } = await import("../src/lib/agents/engine");

  const report: Record<string, unknown> = { status: "live", keyProvider: "openrouter" };

  // 1. Configure connection (persistent) + force every purpose to OpenRouter.
  await saveAiConnections({
    keys: { OPENROUTER_API_KEY: KEY },
    defaultProvider: "openrouter",
    defaultModel: "openrouter/free",
    embeddingProvider: "openrouter",
    embeddingModel: "nvidia/nemotron-3-embed-1b:free",
  });
  const purposes: ModelPurpose[] = [
    "chatbot", "voice", "idea", "strategist", "researcher", "writer",
    "critic", "seo", "publisher", "final_critic", "lessons",
  ];
  for (const purpose of purposes) {
    await upsertModelConfig({
      purpose,
      primaryProvider: "openrouter",
      primaryModel: "openrouter/free",
      fallbackProvider: "openrouter",
      fallbackModel: "openrouter/free",
    });
  }
  resetProviderCache();

  // 2. Real chat completion.
  try {
    const chat = await routerChat({
      purpose: "chatbot",
      messages: [{ role: "user", content: "Reply with exactly: hello openrouter" }],
      maxTokens: 16,
      runId: "verify-chat",
    });
    report.chat = { provider: chat.provider, model: chat.model, latencyMs: chat.latencyMs, ok: true, text: chat.value.text.trim().slice(0, 80) };
  } catch (err) {
    report.chat = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 3. Real embedding request.
  try {
    const emb = await routerEmbedding({ text: "real embedding ping", runId: "verify-emb" });
    report.embedding = {
      provider: emb.provider,
      model: emb.model,
      dimensions: emb.value.dimensions,
      latencyMs: emb.latencyMs,
      ok: true,
    };
  } catch (err) {
    report.embedding = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 4. Real RAG pipeline: index a temp doc, retrieve with the real embedder.
  let tempDocId: string | null = null;
  try {
    const doc = await createKnowledgeDocument({
      title: "Forests and carbon",
      content: "Forests store carbon, filter water and shelter most terrestrial biodiversity. Protecting old growth forests is a nature-based climate solution.",
      language: "en",
      status: "active",
    });
    tempDocId = doc.id;
    const indexed = await indexDocument(doc.id, "verify-index");
    const results = await searchKnowledge("how do forests store carbon?", { language: "en", topK: 3 });
    report.rag = {
      indexed,
      retrieved: results.length,
      topHit: results[0]
        ? { title: results[0].title, similarity: results[0].similarity }
        : null,
      ok: results.length > 0,
    };
  } catch (err) {
    report.rag = { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (tempDocId) await deleteKnowledgeDocument(tempDocId).catch(() => undefined);
  }

  // 5. Real article generation through the full agent pipeline.
  try {
    const { runId } = await startArticleRun({ topic: "How forests store carbon", language: "en" });
    const startedAt = Date.now();
    const terminal = new Set(["completed", "failed", "needs_review", "waiting_human"]);
    let run: { status?: string } = { status: "queued" };
    while (Date.now() - startedAt < 6 * 60_000) {
      const polling = await getRunForPolling(runId);
      run = polling as { status?: string };
      if (terminal.has(run.status ?? "")) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    report.article = { runId, finalStatus: run.status, ok: run.status === "completed" || run.status === "needs_review" };
  } catch (err) {
    report.article = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: "error", error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});