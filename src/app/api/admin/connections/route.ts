import { NextResponse } from "next/server";
import { getAiConnections, saveAiConnections, testAllConnections, testAllConnectionsDeep, providerEnvFor } from "@/lib/services/ai-connections";
import { listProviders, listConfiguredModels } from "@/lib/ai/registry";
import { logAudit } from "@/lib/services/audit";
import type { AiConnectionsConfig } from "@/lib/services/ai-connections";

export const dynamic = "force-dynamic";

const PROVIDER_KEYS = ["openai", "openrouter", "anthropic", "google", "groq"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";
  const [connections, catalog] = await Promise.all([getAiConnections(), listConfiguredModels()]);

  const providers = listProviders()
    .filter((p) => p.key !== "mock")
    .map((p) => {
      const env = providerEnvFor(p.key);
      const hasStored = Boolean(connections.keys[env ?? ""]);
      const hasEnv = Boolean(env && process.env[env]);
      return {
        key: p.key,
        name: p.name,
        configured: p.isConfigured(),
        hasKey: hasStored || hasEnv,
        source: hasStored ? "stored" : hasEnv ? "env" : "none",
        env: env ?? null,
        free: p.models().some((m) => m.free),
        models: p
          .models()
          .filter((m) => !m.supportsEmbeddings)
          .map((m) => ({ id: m.id, name: m.name, free: Boolean(m.free) })),
      };
    });

  const deepTests = deep ? await testAllConnectionsDeep() : [];

  return NextResponse.json({
    providers,
    defaults: {
      provider: connections.defaultProvider,
      model: connections.defaultModel,
      embeddingProvider: connections.embeddingProvider,
      embeddingModel: connections.embeddingModel,
    },
    embeddingModels: catalog
      .flatMap((p) => p.models.filter((m) => m.supportsEmbeddings))
      .map((m) => ({ id: m.id, name: m.name, free: Boolean(m.free) })),
    deepTests,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const current = await getAiConnections();
  const next: AiConnectionsConfig = {
    keys: { ...current.keys },
    defaultProvider: current.defaultProvider,
    defaultModel: current.defaultModel,
    embeddingProvider: current.embeddingProvider,
    embeddingModel: current.embeddingModel,
  };

  // Update keys: only keys explicitly provided in `keys` are touched.
  const rawKeys = (body as { keys?: Record<string, unknown> }).keys;
  if (rawKeys && typeof rawKeys === "object") {
    for (const [env, value] of Object.entries(rawKeys)) {
      const str = String(value ?? "").trim();
      if (str) next.keys[env] = str;
      else delete next.keys[env];
    }
  }
  if (body.defaultProvider !== undefined) next.defaultProvider = String(body.defaultProvider);
  if (body.defaultModel !== undefined) next.defaultModel = String(body.defaultModel);
  if (body.embeddingProvider !== undefined) next.embeddingProvider = String(body.embeddingProvider);
  if (body.embeddingModel !== undefined) next.embeddingModel = String(body.embeddingModel);

  await saveAiConnections(next);
  await logAudit({ actor: "admin", action: "connections.updated", metadata: { providers: Object.keys(next.keys) } });

  const doTest = body.test !== false;
  const testResults = doTest ? await testAllConnections() : [];

  return NextResponse.json({ ok: true, testResults, providerKeys: PROVIDER_KEYS });
}
