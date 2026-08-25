/**
 * Multilingual RAG regression (A-F). Real OpenRouter embeddings, local dataset.
 * Creates ONE temp Persian document, runs cross-language retrievals, cleans up.
 */
import { loadEnv } from "./env";
loadEnv();

async function main() {
  const { applyAiConnections } = await import("../src/lib/services/ai-connections");
  await applyAiConnections();
  const { createKnowledgeDocument, indexDocument, deleteKnowledgeDocument, searchKnowledge, buildRagContext, listKnowledgeDocuments } =
    await import("../src/lib/rag");

  // Ensure the seeded ENGLISH reefs article actually has REAL vectors locally
  // (earlier broken-reindex era left seed docs with stale chunkCount metadata
  // but zero vector rows). indexDocument rebuilds chunks + metadata.
  const allDocs = await listKnowledgeDocuments();
  const reefs = allDocs.find((d) => d.title.startsWith("Why Coral Reefs"));
  if (!reefs) throw new Error("seeded reefs doc not found");
  await indexDocument(reefs.id, "lang-test-reefs");
  const reefsAfter = (await listKnowledgeDocuments()).find((d) => d.id === reefs.id);
  const results: Record<string, unknown> = {
    reefsIndexedVectors: reefsAfter?.chunkCount,
    reefsIdentity: `${reefsAfter?.embeddingProvider}/${reefsAfter?.embeddingModel}/${reefsAfter?.embeddingDimensions}`,
  };

  // Real multilingual test data: Persian pollination article.
  const tmp = await createKnowledgeDocument({
    title: "نقش زنبور عسل در گرده‌افشانی",
    content:
      "زنبورهای عسل گرده را میان گل‌ها منتقل می‌کنند و نقشی کلیدی در گرده‌افشانی و تولید میوه دارند. بدون آن‌ها بسیاری از گیاهان توان تولید مثل نخواهند داشت.",
    language: "fa",
    author: "rag-lang-test",
    sourceType: "curated",
    status: "active",
  });
  const indexed = await indexDocument(tmp.id, "lang-test");
  results.tempFaDoc = { id: tmp.id.slice(0, 8), chunks: indexed.chunks };

  try {
    // A. Persian query → Persian document
    const a = await searchKnowledge("زنبور عسل چگونه گرده افشانی می کند؟", { topK: 3 });
    results.A_faQuery_faDoc = {
      topTitle: a[0]?.title.slice(0, 30),
      topSim: Number((a[0]?.similarity ?? 0).toFixed(4)),
      pass: Boolean(a[0] && a[0].language === "fa" && a[0].similarity >= 0.4),
    };

    // B. Persian query → English TWIN document (controlled: same content, EN)
    const tmpEn = await createKnowledgeDocument({
      title: "Honeybees and pollination",
      content:
        "Honeybees transfer pollen between flowers and play a key role in pollination and fruit production. Without them, many plants could not reproduce.",
      language: "en",
      author: "rag-lang-test",
      sourceType: "curated",
      status: "active",
    });
    await indexDocument(tmpEn.id, "lang-test-en");
    const b = await searchKnowledge("زنبور عسل چگونه گرده افشانی می کند؟", { topK: 8 });
    const bEnHit = b.find((r) => r.documentId === tmpEn.id);
    results.B_faQuery_enDoc = {
      rankedLangs: b.map((r) => `${r.language}:${r.similarity.toFixed(3)}`),
      enTwinSim: Number((bEnHit?.similarity ?? 0).toFixed(4)),
      pass: Boolean(bEnHit && bEnHit.similarity >= 0.4),
    };

    // C. English query → English document
    const cc = await searchKnowledge("Why do giant sequoias need wildfire to reproduce?", { topK: 3 });
    results.C_enQuery_enDoc = {
      topTitle: cc[0]?.title.slice(0, 30),
      topSim: Number((cc[0]?.similarity ?? 0).toFixed(4)),
      pass: Boolean(cc[0] && cc[0].language === "en" && cc[0].similarity >= 0.4),
    };

    // D. English query → Persian document
    const d = await searchKnowledge("How do honeybees support pollination and fruit production?", { topK: 3 });
    const dFa = d.find((r) => r.language === "fa");
    results.D_enQuery_faDoc = {
      topLang: d[0]?.language,
      bestFaSim: Number((dFa?.similarity ?? 0).toFixed(4)),
      pass: Boolean(dFa && dFa.similarity >= 0.4),
    };

    // E. Unrelated question → refusal semantics (no context, hasRelevant=false)
    const e = await buildRagContext("Who is the current president of the United States?", "fa");
    results.E_unrelated_refusal = {
      hasRelevant: e.hasRelevant,
      sourcesEmpty: e.sources.length === 0,
      contextEmpty: e.context === "",
      pass: !e.hasRelevant && e.sources.length === 0,
    };

    // F. UI locale must NOT alter the retrieval corpus: same query, opposite locales
    const f1 = await buildRagContext("زنبور عسل چگونه گرده افشانی می کند؟", "en");
    const f2 = await buildRagContext("زنبور عسل چگونه گرده افشانی می کند؟", "fa");
    results.F_localeInvariant = {
      enLocaleGrounded: f1.hasRelevant,
      faLocaleGrounded: f2.hasRelevant,
      sameSourceCount: f1.sources.length === f2.sources.length,
      pass: f1.hasRelevant === f2.hasRelevant && f1.hasRelevant === true,
    };
  } finally {
    await deleteKnowledgeDocument(tmp.id);
    const docs = await listKnowledgeDocuments();
    const twin = docs.find((d) => d.author === "rag-lang-test" && d.language === "en");
    if (twin) await deleteKnowledgeDocument(twin.id);
  }

  console.log(JSON.stringify(results, null, 2));
  const allPass = Object.values(results).every(
    (v) => typeof v === "object" && v !== null && (v as { pass?: boolean }).pass !== false
  );
  console.log(allPass ? "ALL_MULTILINGUAL_CHECKS_PASS" : "CHECKS_FAILED");
  if (!allPass) process.exit(2);
}
main().catch((e) => { console.error(e); process.exit(1); });
