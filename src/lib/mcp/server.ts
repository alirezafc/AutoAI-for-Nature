import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TOOL_DEFS, executeMcpTool } from "./tools";

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "autoai-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  for (const def of TOOL_DEFS) {
    server.tool(def.name, def.description, def.schema, async (args) =>
      executeMcpTool(def.name, args as Record<string, unknown>)
    );
  }

  return server;
}
