/* Read-only AutoAI MCP server over stdio.
 * Usage: npm run mcp:stdio
 * Configure in Claude Desktop / Cursor as a stdio MCP server pointing to:
 *   npx tsx scripts/mcp-stdio.ts
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../src/lib/mcp/server";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AutoAI MCP server (stdio) connected — read-only tools available.");
}

main().catch((err) => {
  console.error("MCP stdio server failed:", err);
  process.exit(1);
});
