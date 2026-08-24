import { NextResponse } from "next/server";
import { getVoiceConfig, setVoiceConfig } from "@/lib/services/voice";
import { logAudit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getVoiceConfig();
  return NextResponse.json({ config });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const config = await setVoiceConfig({
    sttProvider: body.sttProvider !== undefined ? String(body.sttProvider) : undefined,
    sttModel: body.sttModel !== undefined ? String(body.sttModel) : undefined,
    llmProvider: body.llmProvider !== undefined ? String(body.llmProvider) : undefined,
    llmModel: body.llmModel !== undefined ? String(body.llmModel) : undefined,
    ttsProvider: body.ttsProvider !== undefined ? String(body.ttsProvider) : undefined,
    ttsModel: body.ttsModel !== undefined ? String(body.ttsModel) : undefined,
    voice: body.voice !== undefined ? String(body.voice) : undefined,
    temperature: body.temperature !== undefined ? Number(body.temperature) : undefined,
    speed: body.speed !== undefined ? Number(body.speed) : undefined,
    greeting: body.greeting !== undefined ? String(body.greeting) : undefined,
    systemPrompt: body.systemPrompt !== undefined ? String(body.systemPrompt) : undefined,
    ragEnabled: body.ragEnabled !== undefined ? Boolean(body.ragEnabled) : undefined,
    saveConversations: body.saveConversations !== undefined ? Boolean(body.saveConversations) : undefined,
  });
  await logAudit({ actor: "admin", action: "voice_config.updated" });
  return NextResponse.json({ config });
}
