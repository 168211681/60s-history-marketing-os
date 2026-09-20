import { NextRequest, NextResponse } from "next/server";
import { database, databaseConfigured, transaction } from "@/lib/database";
import { ownerId } from "@/lib/auth/config";
import { videoProvider } from "@/lib/video";
import { uploadVideoPrivate } from "@/lib/youtube/google";
import { accessTokenForOwner } from "@/lib/youtube/store";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordWorkflowEvent } from "@/lib/workflows/events";
import { storeVideoArtifactFromUrl } from "@/lib/video/artifacts";
import { listImageAssets } from "@/lib/media/assets";

export const runtime = "nodejs";
export const maxDuration = 60;
// A Vercel function has a bounded request lifetime. Reclaim synchronous renders
// promptly when the function is killed before it can persist a result.
const RENDER_TIMEOUT_MINUTES = 3;

function authorized(request: NextRequest) {
  return isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET);
}

type ClaimedWorkflow = {
  id: string;
  script_draft_id: string;
  channel_id: string;
  title: string;
  hook: string;
  script_body: string;
  scene_cues: string;
  edit_plan?: unknown;
  caption_text: string;
  attempts: number;
  provider_job_id?: string;
  artifact_url?: string;
};

async function claimWorkflow(channelId: string) {
  return transaction(async (client) => {
    const result = await client.query<ClaimedWorkflow>(
      `with next_workflow as (
         select w.id
           from public.production_workflows w
          where w.channel_id = $1 and w.status = 'queued'
          order by w.created_at asc
          for update skip locked
          limit 1
       )
       update public.production_workflows w
          set status = 'rendering', current_step = 'rendering', attempts = attempts + 1, updated_at = now()
         from next_workflow n, public.script_drafts d
        where w.id = n.id and d.id = w.script_draft_id and d.status = 'approved' and w.attempts < 10
       returning w.id, w.script_draft_id, w.channel_id, d.title, d.hook,
                 d.script_body, d.scene_cues, d.caption_text, d.edit_plan, w.attempts`,
      [channelId],
    );
    return result.rows[0] ?? null;
  });
}

async function renderingWorkflow(channelId: string) {
  const result = await database().query<ClaimedWorkflow>(
    `select w.id, w.script_draft_id, w.channel_id, w.provider_job_id, w.attempts
       from public.production_workflows w
       join public.script_drafts d on d.id = w.script_draft_id and d.status = 'approved'
      where w.channel_id = $1 and w.status = 'rendering' and w.provider_job_id is not null
      order by w.updated_at asc limit 1`,
    [channelId],
  );
  return result.rows[0] ?? null;
}

async function timeoutRenderingWorkflow(channelId: string) {
  return transaction(async (client) => {
    const result = await client.query<{ id: string; channel_id: string; attempts: number }>(
      `with stale_workflow as (
         select w.id
           from public.production_workflows w
          where w.channel_id = $1 and w.status = 'rendering'
            and w.updated_at < now() - ($2::text || ' minutes')::interval
          order by w.updated_at asc
          for update skip locked
          limit 1
       )
       update public.production_workflows w
          set status = 'failed', current_step = 'failed', error_code = 'PROVIDER_TIMEOUT', updated_at = now()
         from stale_workflow s
        where w.id = s.id and w.status = 'rendering'
       returning w.id, w.channel_id, w.attempts`,
      [channelId, RENDER_TIMEOUT_MINUTES],
    );
    return result.rows[0] ?? null;
  });
}

async function claimRenderedWorkflow(channelId: string) {
  return transaction(async (client) => {
    const result = await client.query<ClaimedWorkflow>(
      `with next_workflow as (
         select w.id from public.production_workflows w
          where w.channel_id = $1 and w.status = 'rendered'
            and w.current_step = 'awaiting_upload' and w.artifact_url is not null
          order by w.updated_at asc for update skip locked limit 1
       )
       update public.production_workflows w
          set current_step = 'uploading_private', updated_at = now()
         from next_workflow n, public.script_drafts d
        where w.id = n.id and d.id = w.script_draft_id and d.status = 'approved'
      returning w.id, w.script_draft_id, w.channel_id, w.artifact_url, w.attempts, d.title, d.script_body`,
      [channelId],
    );
    return result.rows[0] ?? null;
  });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const owner = ownerId();
  if (!owner || !databaseConfigured()) return new Response("Workflow is not configured", { status: 503 });

  const channel = await database().query<{ id: string }>(
    `select c.id from public.channels c
      join private.youtube_connections yc on yc.channel_id = c.id and yc.owner_id = c.owner_id
     where c.owner_id = $1 limit 1`,
    [owner],
  );
  const channelId = channel.rows[0]?.id;
  if (!channelId) return NextResponse.json({ status: "not-connected" }, { status: 409 });

  const upload = await claimRenderedWorkflow(channelId);
  if (upload?.artifact_url) {
    await recordWorkflowEvent({ workflowId: upload.id, channelId, attempt: upload.attempts, eventType: "upload_started", status: "rendered" });
    try {
      const accessToken = await accessTokenForOwner(owner);
      if (!accessToken) throw new Error("YOUTUBE_CONNECTION_MISSING");
      const result = await uploadVideoPrivate(accessToken, upload.artifact_url, { title: upload.title, description: upload.script_body });
      await database().query(
        `update public.production_workflows
            set status = 'uploaded_private', current_step = 'awaiting_publish', youtube_video_id = $2, error_code = null, updated_at = now()
          where id = $1 and channel_id = $3 and current_step = 'uploading_private'`,
        [upload.id, result.youtubeVideoId, channelId],
      );
      await recordWorkflowEvent({ workflowId: upload.id, channelId, attempt: upload.attempts, eventType: "uploaded_private", status: "uploaded_private" });
      return NextResponse.json({ status: "uploaded_private", workflowId: upload.id, youtubeVideoId: result.youtubeVideoId });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "YOUTUBE_UPLOAD_FAILED";
      await database().query(
        `update public.production_workflows
            set status = 'failed', current_step = 'failed', error_code = $2, updated_at = now()
          where id = $1 and channel_id = $3 and current_step = 'uploading_private'`,
        [upload.id, code, channelId],
      );
      await recordWorkflowEvent({ workflowId: upload.id, channelId, attempt: upload.attempts, eventType: "failed", status: "failed", errorCode: code, metadata: { stage: "upload" } });
      return NextResponse.json({ status: "failed", workflowId: upload.id, code }, { status: 502 });
    }
  }

  const workflow = await claimWorkflow(channelId);
  if (!workflow) {
    const timedOut = await timeoutRenderingWorkflow(channelId);
    if (timedOut) {
      await recordWorkflowEvent({
        workflowId: timedOut.id,
        channelId: timedOut.channel_id,
        attempt: timedOut.attempts,
        eventType: "failed",
        status: "failed",
        errorCode: "PROVIDER_TIMEOUT",
        metadata: { stage: "timeout" },
      });
      return NextResponse.json({ status: "failed", workflowId: timedOut.id, code: "PROVIDER_TIMEOUT" }, { status: 504 });
    }
    const pending = await renderingWorkflow(channelId);
    if (!pending?.provider_job_id) return NextResponse.json({ status: "idle" });
    try {
      const current = await videoProvider().status(pending.provider_job_id);
      await recordWorkflowEvent({
        workflowId: pending.id,
        channelId,
        attempt: pending.attempts,
        eventType: "polled",
        status: current.status === "completed" ? "rendered" : current.status === "failed" ? "failed" : "rendering",
        metadata: { provider_status: current.status },
      });
      if (current.status === "completed") {
        await database().query(
          `update public.production_workflows
              set status = 'rendered', current_step = 'awaiting_upload', artifact_url = $2, error_code = null, updated_at = now()
            where id = $1 and channel_id = $3 and status = 'rendering'`,
          [pending.id, current.artifactUrl, channelId],
        );
        await recordWorkflowEvent({ workflowId: pending.id, channelId, attempt: pending.attempts, eventType: "rendered", status: "rendered" });
      } else if (current.status === "failed") {
        await database().query(
          `update public.production_workflows
              set status = 'failed', current_step = 'failed', error_code = 'PROVIDER_FAILED', updated_at = now()
            where id = $1 and channel_id = $2 and status = 'rendering'`,
          [pending.id, channelId],
        );
        await recordWorkflowEvent({ workflowId: pending.id, channelId, attempt: pending.attempts, eventType: "failed", status: "failed", errorCode: "PROVIDER_FAILED", metadata: { stage: "poll" } });
      }
      return NextResponse.json({ status: current.status, workflowId: pending.id });
    } catch (error) {
      await recordWorkflowEvent({ workflowId: pending.id, channelId, attempt: pending.attempts, eventType: "poll_failed", status: "rendering", metadata: { stage: "poll" } });
      return NextResponse.json({ status: "poll-failed", workflowId: pending.id, code: error instanceof Error ? error.message : "POLL_FAILED" }, { status: 502 });
    }
  }

  let providerName = "unknown";
  let providerConfigured = false;
  try {
    await recordWorkflowEvent({ workflowId: workflow.id, channelId, attempt: workflow.attempts, eventType: "claimed", status: "rendering" });
    const provider = videoProvider();
    providerName = provider.name;
    providerConfigured = provider.configured;
    if (!provider.configured) throw new Error(`${provider.name.toUpperCase()}_NOT_CONFIGURED`);
    const job = await provider.submit({
      draftId: workflow.script_draft_id,
      ownerId: owner,
      title: workflow.title,
      hook: workflow.hook,
      scriptBody: workflow.script_body,
      sceneCues: workflow.scene_cues,
      captionText: workflow.caption_text,
      editPlan: workflow.edit_plan && typeof workflow.edit_plan === "object" ? workflow.edit_plan as import("@/lib/video/provider").EditPlan : undefined,
      imageAssets: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? await listImageAssets(owner)
        : [],
    });
    if (job.artifactUrl) {
      const storedArtifact = await storeVideoArtifactFromUrl(job.artifactUrl);
      await database().query(
        `update public.production_workflows
            set provider_job_id = $2, artifact_url = $3, status = 'rendered', current_step = 'awaiting_upload', updated_at = now()
          where id = $1 and channel_id = $4 and status = 'rendering'`,
        [workflow.id, job.externalJobId, storedArtifact.artifactUrl, channelId],
      );
      await recordWorkflowEvent({
        workflowId: workflow.id,
        channelId,
        attempt: workflow.attempts,
        eventType: "rendered",
        status: "rendered",
        metadata: { provider: provider.name, source_attribution: job.sourceAttribution ?? "" },
      });
      return NextResponse.json({ status: "rendered", workflowId: workflow.id });
    }
    await database().query(
      `update public.production_workflows
          set provider_job_id = $2, updated_at = now()
        where id = $1 and channel_id = $3 and status = 'rendering'`,
      [workflow.id, job.externalJobId, channelId],
    );
    await recordWorkflowEvent({ workflowId: workflow.id, channelId, attempt: workflow.attempts, eventType: "submitted", status: "rendering", metadata: { provider: provider.name } });
    return NextResponse.json({ status: "submitted", workflowId: workflow.id, providerJobId: job.externalJobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /depleted your monthly included credits|purchase pre-paid credits/i.test(message)
      ? "PROVIDER_CREDITS_DEPLETED"
      : error instanceof Error && error.name === "TimeoutError"
      ? "PROVIDER_TIMEOUT"
      : error instanceof Error && error.name === "ProviderOutputError"
      ? "PROVIDER_OUTPUT_ERROR"
      : message.match(/\b[A-Z][A-Z0-9_]{3,}\b/)?.[0] ?? "PROVIDER_FAILED";
    console.error("production workflow provider failed", {
      workflowId: workflow.id,
      provider: providerName,
      configured: providerConfigured,
      code,
      errorName: error instanceof Error ? error.name : typeof error,
      message: message.slice(0, 500),
    });
    await database().query(
      `update public.production_workflows
          set status = 'failed', current_step = 'failed', error_code = $2, updated_at = now()
        where id = $1 and channel_id = $3 and status = 'rendering'`,
      [workflow.id, code, channelId],
    );
    await recordWorkflowEvent({ workflowId: workflow.id, channelId, attempt: workflow.attempts, eventType: "failed", status: "failed", errorCode: code, metadata: { stage: "submit" } });
    return NextResponse.json({ status: "failed", workflowId: workflow.id, code }, { status: 502 });
  }
}
