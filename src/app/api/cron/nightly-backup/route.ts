import { NextResponse } from "next/server";
import { runWorkflow, ensureDefaultWorkflow } from "@/lib/services/workflows";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  // Fail closed in production: without CRON_SECRET configured the endpoint
  // must never run. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
  // automatically when the env var is set.
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured. Set it in the environment and Vercel Cron settings." },
        { status: 500 }
      );
    }
    console.warn("AutoAI: cron endpoint ran WITHOUT secret verification (development mode).");
  } else if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultWorkflow();
  const result = await runWorkflow("nightly-backup");
  return NextResponse.json({ ok: result.status === "success", ...result });
}
