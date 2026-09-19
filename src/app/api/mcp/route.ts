import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { isMcpAuthorized } from "@/lib/ai/mcp-auth";
import { createProductionWorkflow, insightSnapshot, ownerContext, productionWorkflows, saveAiInsight, saveContentIdea, saveScriptDraft } from "@/lib/ai/mcp-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const shortText = (max: number) => z.string().trim().min(1).max(max);

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "MCP tool failed";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function server() {
  const mcp = new McpServer({ name: "60s-history-marketing-os", version: "0.1.0" });
  mcp.registerTool("get_channel_metrics", {
    title: "Get channel metrics",
    description: "Read the connected owner's latest stored YouTube analytics. Values are real synced data when available.",
    inputSchema: { limit: z.number().int().min(1).max(20).optional() },
  }, async ({ limit }) => {
    try {
      const context = await ownerContext();
      return result({ source: "stored_youtube_analytics", channel: context.channelTitle, period: context.period, summary: context.workspace.summary, weeklyViews: context.workspace.weeklyViews, limit: limit ?? 20 });
    } catch (error) { return failure(error); }
  });
  mcp.registerTool("get_top_videos", {
    title: "Get top videos",
    description: "Rank stored videos by views for the latest completed reporting period.",
    inputSchema: { limit: z.number().int().min(1).max(20).default(10) },
  }, async ({ limit }) => {
    try {
      const context = await ownerContext();
      return result({ source: "stored_youtube_analytics", channel: context.channelTitle, period: context.period, videos: [...context.workspace.videos].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)).slice(0, limit) });
    } catch (error) { return failure(error); }
  });
  mcp.registerTool("get_marketing_insights", {
    title: "Get marketing insights",
    description: "Return evidence-led calculated insights and clearly labeled hypotheses and experiments.",
    inputSchema: {},
  }, async () => {
    try { return result(insightSnapshot(await ownerContext())); } catch (error) { return failure(error); }
  });
  mcp.registerTool("create_content_idea", {
    title: "Create content idea",
    description: "Save a human-reviewable content idea for the connected channel.",
    inputSchema: { title: shortText(200), angle: z.string().trim().max(2000).default("") },
  }, async ({ title, angle }) => {
    try { return result({ source: "codex_mcp", idea: await saveContentIdea(await ownerContext(), title, angle) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("save_marketing_hypothesis", {
    title: "Save marketing hypothesis",
    description: "Save an AI hypothesis or experiment with its evidence summary. AI output cannot be stored as an observation.",
    inputSchema: { kind: z.enum(["hypothesis", "experiment"]), content: shortText(10000), evidenceSummary: shortText(10000), modelIdentifier: shortText(200).default("codex-mcp") },
  }, async ({ kind, content, evidenceSummary, modelIdentifier }) => {
    try { return result({ source: "codex_mcp", insight: await saveAiInsight(await ownerContext(), kind, content, evidenceSummary, modelIdentifier) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("save_script_draft", {
    title: "Save script draft",
    description: "Save a structured 60-second script draft. It remains draft-only until human review and approval.",
    inputSchema: {
      title: shortText(200), hook: shortText(2000), scriptBody: shortText(20000), sceneCues: z.string().max(20000).default(""), captionText: z.string().max(10000).default(""), callToAction: z.string().max(2000).default(""), researchNotes: z.string().max(20000).default(""), contentIdeaId: z.string().uuid().optional(), modelIdentifier: shortText(200).default("codex-mcp"),
    },
  }, async (input) => {
    try { return result({ source: "codex_mcp", approval: "human_required", draft: await saveScriptDraft(await ownerContext(), input) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("start_production_workflow", {
    title: "Start production workflow",
    description: "Create an owner-scoped production workflow only for a human-approved script. This queues work and never publishes to YouTube.",
    inputSchema: { scriptDraftId: z.string().uuid() },
  }, async ({ scriptDraftId }) => {
    try { return result({ source: "codex_mcp", approval: "human_required_for_publish", workflow: await createProductionWorkflow(await ownerContext(), scriptDraftId) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("get_production_workflows", {
    title: "Get production workflows",
    description: "Read the connected owner's production state machine jobs and current steps.",
    inputSchema: { limit: z.number().int().min(1).max(20).default(10) },
  }, async ({ limit }) => {
    try {
      const context = await ownerContext();
      return result({ source: "stored_production_workflows", channel: context.channelTitle, workflows: await productionWorkflows(context, limit) });
    } catch (error) { return failure(error); }
  });
  return mcp;
}

async function handle(request: Request) {
  const secret = process.env.MCP_SECRET;
  if (!secret) return new Response("MCP is not configured", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!isMcpAuthorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    // Vercel handlers are stateless; each request creates its own transport.
    sessionIdGenerator: undefined,
  });
  const mcp = server();
  await mcp.connect(transport);
  const response = await transport.handleRequest(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
