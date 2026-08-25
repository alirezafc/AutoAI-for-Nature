import { NextResponse } from "next/server";
import { fetchOpenRouterModelCatalog } from "@/lib/services/model-catalog";

export const dynamic = "force-dynamic";

/**
 * Sanitized live OpenRouter model catalog for the Models UI.
 * Auth is enforced by middleware for /api/admin/*. The API key never appears
 * in the request handling, response body, or logs.
 */
export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const catalog = await fetchOpenRouterModelCatalog({ refresh });
    return NextResponse.json(catalog);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch OpenRouter catalog" },
      { status: 502 }
    );
  }
}
