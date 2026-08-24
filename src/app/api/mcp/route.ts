import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function checkAuth(req: Request): boolean {
  const secret = process.env.MCP_SECRET;
  // Fail closed in production: the MCP endpoint requires MCP_SECRET.
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization") ?? "";
  const apiKey = req.headers.get("x-api-key") ?? "";
  return auth === `Bearer ${secret}` || apiKey === secret;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createMcpServer();
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Streamable HTTP GET requires SSE support; POST JSON-RPC instead." },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json({ ok: true });
}
