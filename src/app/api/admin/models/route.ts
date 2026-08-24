import { NextResponse } from "next/server";
import { listModelConfigs, upsertModelConfig } from "@/lib/services/model-config";
import { listProviders, listConfiguredModels } from "@/lib/ai/registry";
import { logAudit } from "@/lib/services/audit";
import type { ModelPurpose } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const [configs, catalog] = await Promise.all([
    listModelConfigs(),
    listConfiguredModels(),
  ]);
  return NextResponse.json({ configs, catalog, providers: listProviders().map((p) => ({ key: p.key, name: p.name, configured: p.isConfigured() })) });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.purpose) return NextResponse.json({ error: "purpose required" }, { status: 400 });
  const purpose = String(body.purpose) as ModelPurpose;
  const row = await upsertModelConfig({
    purpose,
    label: body.label !== undefined ? String(body.label) : undefined,
    primaryProvider: body.primaryProvider !== undefined ? String(body.primaryProvider) : undefined,
    primaryModel: body.primaryModel !== undefined ? String(body.primaryModel) : undefined,
    fallbackProvider: body.fallbackProvider !== undefined ? String(body.fallbackProvider) : undefined,
    fallbackModel: body.fallbackModel !== undefined ? String(body.fallbackModel) : undefined,
    temperature: body.temperature !== undefined ? Number(body.temperature) : undefined,
    maxTokens: body.maxTokens !== undefined ? Number(body.maxTokens) : undefined,
    ragEnabled: body.ragEnabled !== undefined ? Boolean(body.ragEnabled) : undefined,
  });
  await logAudit({ actor: "admin", action: "model_config.updated", metadata: { purpose } });
  return NextResponse.json({ config: row });
}
