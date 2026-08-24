import { NextResponse } from "next/server";
import { getVoiceReply, getVoiceConfig } from "@/lib/services/voice";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = String(body?.text ?? "").trim();
  const language = body?.language === "fa" ? "fa" : "en";

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    const reply = await getVoiceReply({ text, language });
    return NextResponse.json(reply);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Voice reply failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const config = await getVoiceConfig();
  return NextResponse.json({ config });
}
