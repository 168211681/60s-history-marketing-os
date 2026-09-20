import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { isMcpAuthorized } from "@/lib/ai/mcp-auth";
import { decodeImageBase64, uploadImageAsset } from "@/lib/media/assets";
import { contentExperiments, contentGenerationPrompt, createContentExperiment, createProductionWorkflow, insightSnapshot, nextContentRecommendation, ownerContext, productionWorkflows, recordContentExperimentResult, retryProductionWorkflow, saveAiInsight, saveContentIdea, saveEditPlan, saveScriptDraft, uploadedImageAssets } from "@/lib/ai/mcp-data";
import type { EditPlan } from "@/lib/video/provider";
import { GET as productionWorker } from "@/app/api/cron/production-workflow/route";
import { NextRequest } from "next/server";

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
  mcp.registerTool("create_content_generation_prompt", {
    title: "Create content generation prompt",
    description: "Summarize stored marketing data and return a copyable prompt for GPT Plus. This tool does not call an AI provider.",
    inputSchema: {
      topic: shortText(500),
      goal: z.string().trim().max(1000).default("Generate a human-reviewable 60-second YouTube Short"),
      language: z.enum(["th", "en"]).default("th"),
      format: z.enum(["youtube_short"]).default("youtube_short"),
    },
  }, async ({ topic, goal, language, format }) => {
    try { return result(await contentGenerationPrompt(await ownerContext(), { topic, goal, language, format })); } catch (error) { return failure(error); }
  });
  mcp.registerTool("create_content_idea", {
    title: "Create content idea",
    description: "Save a human-reviewable content idea for the connected channel.",
    inputSchema: { title: shortText(200), angle: z.string().trim().max(2000).default("") },
  }, async ({ title, angle }) => {
    try { return result({ source: "codex_mcp", idea: await saveContentIdea(await ownerContext(), title, angle) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("create_content_experiment", {
    title: "Create content experiment",
    description: "Store a measurable content hypothesis linked to owner-scoped ideas or drafts.",
    inputSchema: { topic: shortText(300), hookFormat: shortText(200), hypothesis: shortText(5000), contentIdeaId: z.string().uuid().optional(), scriptDraftId: z.string().uuid().optional() },
  }, async ({ topic, hookFormat, hypothesis, contentIdeaId, scriptDraftId }) => {
    try { return result({ source: "codex_mcp", experiment: await createContentExperiment(await ownerContext(), { topic, hookFormat, hypothesis, contentIdeaId, scriptDraftId }) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("list_content_experiments", {
    title: "List content experiments",
    description: "Read the connected owner's content experiment memory.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(20) },
  }, async ({ limit }) => {
    try { return result({ source: "stored_content_experiments", experiments: await contentExperiments(await ownerContext(), limit) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("record_experiment_result", {
    title: "Record experiment result",
    description: "Record observed results for an owner-scoped experiment; metrics remain explicit and nullable.",
    inputSchema: {
      experimentId: z.string().uuid(), status: z.enum(["running", "completed", "cancelled"]), resultSummary: shortText(10000), recommendation: shortText(5000), videoId: z.string().uuid().optional(), views: z.number().min(0).optional(), minutesWatched: z.number().min(0).optional(), averageViewDurationSeconds: z.number().min(0).optional(), likes: z.number().min(0).optional(), comments: z.number().min(0).optional(),
    },
  }, async (input) => {
    try { return result({ source: "codex_mcp", experiment: await recordContentExperimentResult(await ownerContext(), input.experimentId, input) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("get_next_content_recommendation", {
    title: "Get next content recommendation",
    description: "Combine stored marketing insights with experiment memory to suggest the next measurable test.",
    inputSchema: {},
  }, async () => {
    try { return result(await nextContentRecommendation(await ownerContext())); } catch (error) { return failure(error); }
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
  mcp.registerTool("list_uploaded_image_assets", {
    title: "List uploaded image assets",
    description: "List only images uploaded by the connected owner. Use these paths when planning a video; external image sources are not allowed.",
    inputSchema: {},
  }, async () => {
    try { return result({ source: "owner_uploaded_assets", assets: await uploadedImageAssets(await ownerContext()) }); } catch (error) { return failure(error); }
  });
  mcp.registerTool("upload_generated_image", {
    title: "Upload generated image",
    description: "Upload one image generated by Codex into the connected owner's private image storage. The returned path can be used in save_edit_plan. Never upload secrets or personal documents.",
    inputSchema: {
      contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      imageBase64: z.string().min(4).max(21_000_000),
      scene: z.number().int().min(1).max(100).optional(),
    },
  }, async ({ contentType, imageBase64, scene }) => {
    try {
      const context = await ownerContext();
      const asset = await uploadImageAsset(context.ownerId, decodeImageBase64(imageBase64), contentType);
      return result({ source: "codex_mcp", asset, scene: scene ?? null });
    } catch (error) { return failure(error); }
  });
  mcp.registerTool("save_edit_plan", {
    title: "Save image edit plan",
    description: "Save a scene timeline for a script draft. Every assetPath must come from list_uploaded_image_assets.",
    inputSchema: {
      scriptDraftId: z.string().uuid(),
      scenes: z.array(z.object({ scene: z.number().int().min(1).max(100), assetPath: shortText(500), durationSeconds: z.number().min(1).max(60), caption: z.string().max(500).optional() })).min(1).max(100),
    },
  }, async ({ scriptDraftId, scenes }) => {
    try {
      const plan: EditPlan = { version: 1, scenes: scenes.map((scene) => ({ ...scene, caption: scene.caption?.trim() })) };
      return result({ source: "codex_mcp", approval: "human_required", plan: await saveEditPlan(await ownerContext(), scriptDraftId, plan) });
    } catch (error) { return failure(error); }
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
  mcp.registerTool("run_production_worker", {
    title: "Run production worker",
    description: "Process one queued owner workflow through rendering or private YouTube upload. Only approved drafts are eligible; this never publishes publicly.",
    inputSchema: {},
  }, async () => {
    try {
      if (!process.env.CRON_SECRET) throw new Error("WORKER_NOT_CONFIGURED");
      const request = new NextRequest("https://internal.invalid/api/cron/production-workflow", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      const response = await productionWorker(request);
      const payload = await response.json();
      return result({ source: "codex_mcp", httpStatus: response.status, ...payload });
    } catch (error) { return failure(error); }
  });
  mcp.registerTool("retry_production_workflow", {
    title: "Retry production workflow",
    description: "Requeue one owned failed workflow below the retry limit. It still requires an approved script and never publishes publicly.",
    inputSchema: { workflowId: z.string().uuid() },
  }, async ({ workflowId }) => {
    try { return result({ source: "codex_mcp", workflow: await retryProductionWorkflow(await ownerContext(), workflowId) }); } catch (error) { return failure(error); }
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
