import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listPosts, getPost, getPostBySlug } from "@/lib/services/posts";
import { listCategories } from "@/lib/services/categories";
import { listRuns, getRunWithSteps } from "@/lib/services/agent-runs";
import { listActiveLessons } from "@/lib/services/agent-config";
import { listBackups } from "@/lib/services/backups";
import { listWorkflowRuns } from "@/lib/services/workflows";
import { getVectorStats, searchKnowledge } from "@/lib/rag";
import { getConversationWithMessages } from "@/lib/services/conversations";
import { listConfiguredModels } from "@/lib/ai/registry";
import { logMcpInvocation } from "@/lib/services/mcp-log";
import { logger } from "@/lib/logging";

export interface McpToolDef {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

function text(content: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(content, null, 2) }] };
}

function fail(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  };
}

export const TOOL_DEFS: McpToolDef[] = [
  {
    name: "list_posts",
    description: "List published or all posts with optional filters.",
    schema: {
      status: z.enum(["published", "draft", "needs_review", "rejected"]).optional(),
      language: z.enum(["en", "fa"]).optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    handler: async (args) => {
      const rows = await listPosts({
        status: typeof args.status === "string" ? args.status : undefined,
        language: typeof args.language === "string" ? args.language : undefined,
        search: typeof args.search === "string" ? args.search : undefined,
        limit: typeof args.limit === "number" ? args.limit : 20,
      });
      return text(
        rows.map((r) => ({
          id: r.id,
          slug: r.slug,
          title: r.title,
          status: r.status,
          language: r.language,
          isAiGenerated: r.isAiGenerated,
          publishedAt: r.publishedAt,
          excerpt: r.excerpt,
        }))
      );
    },
  },
  {
    name: "get_post",
    description: "Get a single post by id or slug.",
    schema: {
      id: z.string().optional(),
      slug: z.string().optional(),
    },
    handler: async (args) => {
      const byId = typeof args.id === "string" ? await getPost(args.id) : null;
      const bySlug = !byId && typeof args.slug === "string" ? await getPostBySlug(args.slug) : null;
      const post = byId ?? bySlug;
      if (!post) return text({ error: "Post not found" });
      return text(post);
    },
  },
  {
    name: "search_knowledge",
    description: "Semantic search over the multilingual RAG knowledge base (language-agnostic retrieval).",
    schema: {
      query: z.string().min(1),
      topK: z.number().int().min(1).max(10).optional(),
    },
    handler: async (args) => {
      const results = await searchKnowledge(String(args.query), {
        topK: typeof args.topK === "number" ? args.topK : 4,
      });
      return text(results);
    },
  },
  {
    name: "list_agent_runs",
    description: "List recent AI agent pipeline runs.",
    schema: {
      limit: z.number().int().min(1).max(100).optional(),
    },
    handler: async (args) => {
      const rows = await listRuns(typeof args.limit === "number" ? args.limit : 20);
      return text(
        rows.map((r) => ({
          id: r.id,
          runType: r.runType,
          status: r.status,
          language: r.language,
          topic: r.topic,
          postId: r.postId,
          steps: r.steps,
          createdAt: r.createdAt,
          finishedAt: r.finishedAt,
        }))
      );
    },
  },
  {
    name: "get_agent_run",
    description: "Get a single agent run including all agent steps.",
    schema: {
      id: z.string().min(1),
    },
    handler: async (args) => {
      const run = await getRunWithSteps(String(args.id));
      if (!run) return text({ error: "Run not found" });
      return text(run);
    },
  },
  {
    name: "list_categories",
    description: "List all content categories.",
    schema: {},
    handler: async () => text(await listCategories()),
  },
  {
    name: "get_vector_stats",
    description: "Get RAG vector store statistics.",
    schema: {},
    handler: async () => text(await getVectorStats()),
  },
  {
    name: "list_backups",
    description: "List recent content backups.",
    schema: {
      limit: z.number().int().min(1).max(50).optional(),
    },
    handler: async (args) =>
      text(await listBackups(typeof args.limit === "number" ? args.limit : 10)),
  },
  {
    name: "list_workflow_runs",
    description: "List recent workflow executions.",
    schema: {
      limit: z.number().int().min(1).max(50).optional(),
    },
    handler: async (args) =>
      text(await listWorkflowRuns(typeof args.limit === "number" ? args.limit : 10)),
  },
  {
    name: "list_lessons",
    description: "List lessons learned by the AI pipeline that are applied to future runs.",
    schema: {
      limit: z.number().int().min(1).max(100).optional(),
    },
    handler: async () => text(await listActiveLessons()),
  },
  {
    name: "get_conversation",
    description: "Get a chat conversation with all messages.",
    schema: {
      id: z.string().min(1),
    },
    handler: async (args) => {
      const conv = await getConversationWithMessages(String(args.id));
      if (!conv) return text({ error: "Conversation not found" });
      return text(conv);
    },
  },
  {
    name: "list_models",
    description: "List configured AI models by purpose.",
    schema: {},
    handler: async () => text(await listConfiguredModels()),
  },
];

const BY_NAME = new Map(TOOL_DEFS.map((t) => [t.name, t]));

export async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  host = "mcp"
): Promise<CallToolResult> {
  const def = BY_NAME.get(name);
  if (!def) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  const started = Date.now();
  try {
    const schema = z.object(def.schema);
    const parsed = schema.safeParse(args ?? {});
    if (!parsed.success) {
      return {
        content: [{ type: "text", text: `Invalid arguments: ${parsed.error.message}` }],
        isError: true,
      };
    }
    const result = await def.handler(parsed.data);
    await logMcpInvocation({ tool: name, host, status: result.isError ? "error" : "success", durationMs: Date.now() - started, paramsSummary: JSON.stringify(args).slice(0, 200) });
    return result;
  } catch (err) {
    logger.error(`MCP tool ${name} failed`, { error: err instanceof Error ? err.message : String(err) });
    await logMcpInvocation({ tool: name, host, status: "error", durationMs: Date.now() - started, paramsSummary: JSON.stringify(args).slice(0, 200), error: err instanceof Error ? err.message : String(err) });
    return fail(err);
  }
}
