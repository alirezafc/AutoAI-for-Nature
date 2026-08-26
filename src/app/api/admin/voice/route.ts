import { NextResponse } from "next/server";
import { getVoiceConfig, resolveVoiceSettings, VOICE_STATUS } from "@/lib/services/voice";
import { getPurposeConfig } from "@/lib/services/model-config";
import { setVoiceConfig } from "@/lib/services/voice";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

/**
 * V1 Voice Agent settings: ONLY the fields the implementation consumes
 * (ragEnabled / systemPrompt / temperature). STT+TTS run in the browser via
 * the Web Speech API; the LLM is resolved per-purpose ("voice") through
 * Admin → Models — reported here as live status, never as editable fakes.
 */
export async function GET() {
  const raw = await getVoiceConfig();
  const config = resolveVoiceSettings(raw);
  let engine = { provider: "", model: "" };
  try {
    const purpose = await getPurposeConfig("voice");
    engine = { provider: purpose?.primaryProvider ?? "", model: purpose?.primaryModel ?? "" };
  } catch {
    engine = { provider: "", model: "" };
  }
  return NextResponse.json({ config, status: VOICE_STATUS, engine });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 });

  // Whitelist: exactly the supported V1 surface.
  const patch: { ragEnabled?: boolean; systemPrompt?: string; temperature?: number } = {};
  if (body.ragEnabled !== undefined) patch.ragEnabled = Boolean(body.ragEnabled);
  if (body.systemPrompt !== undefined) patch.systemPrompt = String(body.systemPrompt);
  if (body.temperature !== undefined) {
    const n = Number(body.temperature);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "invalid temperature" }, { status: 400 });
    patch.temperature = Math.max(0, Math.min(100, n));
  }

  const stored = await setVoiceConfig(patch);
  await logAudit({ actor: "admin", action: "voice_config.updated" });
  return NextResponse.json({ config: resolveVoiceSettings(stored) });
}
