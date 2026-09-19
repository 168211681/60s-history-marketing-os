import { NextRequest, NextResponse } from "next/server";
import { database, databaseConfigured, transaction } from "@/lib/database";
import { ownerId } from "@/lib/auth/config";
import { videoProvider } from "@/lib/video";
import { uploadVideoPrivate } from "@/lib/youtube/google";
import { accessTokenForOwner } from "@/lib/youtube/store";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

type ClaimedWorkflow = {
  id: string;
  script_draft_id: string;
  channel_id: string;
  title: string;
  hook: string;
  script_body: string;
  scene_cues: string;
  caption_text: string;
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
          set status = 'rendering', current_step = 'rendering', updated_at = now()
         from next_workflow n, public.script_drafts d
        where w.id = n.id and d.id = w.script_draft_id and d.status = 'approved'
       returning w.id, w.script_draft_id, w.channel_id, d.title, d.hook,
                 d.script_body, d.scene_cues, d.caption_text`,
      [channelId],
    );
    return result.rows[0] ?? null;
  });
}

async function renderingWorkflow(channelId: string) {
  const result = await database().query<ClaimedWorkflow>(
    `select w.id, w.script_draft_id, w.channel_id, w.provider_job_id
       from public.production_workflows w
       join public.script_drafts d on d.id = w.script_draft_id and d.status = 'approved'
      where w.channel_id = $1 and w.status = 'rendering' and w.provider_job_id is not null
      order by w.updated_at asc limit 1`,
    [channelId],
  );
  return result.rows[0] ?? null;
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
       returning w.id, w.script_draft_id, w.channel_id, w.artifact_url, d.title, d.script_body`,
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
      return NextResponse.json({ status: "uploaded_private", workflowId: upload.id, youtubeVideoId: result.youtubeVideoId });
    } catch (error) {
      const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "YOUTUBE_UPLOAD_FAILED";
      await database().query(
        `update public.production_workflows
            set status = 'failed', current_step = 'failed', error_code = $2, updated_at = now()
          where id = $1 and channel_id = $3 and current_step = 'uploading_private'`,
        [upload.id, code, channelId],
      );
      return NextResponse.json({ status: "failed", workflowId: upload.id, code }, { status: 502 });
    }
  }

  const workflow = await claimWorkflow(channelId);
  if (!workflow) {
    const pending = await renderingWorkflow(channelId);
    if (!pending?.provider_job_id) return NextResponse.json({ status: "idle" });
    try {
      const current = await videoProvider().status(pending.provider_job_id);
      if (current.status === "completed") {
        await database().query(
          `update public.production_workflows
              set status = 'rendered', current_step = 'awaiting_upload', artifact_url = $2, error_code = null, updated_at = now()
            where id = $1 and channel_id = $3 and status = 'rendering'`,
          [pending.id, current.artifactUrl, channelId],
        );
      } else if (current.status === "failed") {
        await database().query(
          `update public.production_workflows
              set status = 'failed', current_step = 'failed', error_code = 'PROVIDER_FAILED', updated_at = now()
            where id = $1 and channel_id = $2 and status = 'rendering'`,
          [pending.id, channelId],
        );
      }
      return NextResponse.json({ status: current.status, workflowId: pending.id });
    } catch (error) {
      return NextResponse.json({ status: "poll-failed", workflowId: pending.id, code: error instanceof Error ? error.message : "POLL_FAILED" }, { status: 502 });
    }
  }

  try {
    const provider = videoProvider();
    if (!provider.configured) throw new Error(`${provider.name.toUpperCase()}_NOT_CONFIGURED`);
    const job = await provider.submit({
      draftId: workflow.script_draft_id,
      title: workflow.title,
      hook: workflow.hook,
      scriptBody: workflow.script_body,
      sceneCues: workflow.scene_cues,
      captionText: workflow.caption_text,
    });
    if (job.artifactUrl) {
      await database().query(
        `update public.production_workflows
            set provider_job_id = $2, artifact_url = $3, status = 'rendered', current_step = 'awaiting_upload', updated_at = now()
          where id = $1 and channel_id = $4 and status = 'rendering'`,
        [workflow.id, job.externalJobId, job.artifactUrl, channelId],
      );
      return NextResponse.json({ status: "rendered", workflowId: workflow.id });
    }
    await database().query(
      `update public.production_workflows
          set provider_job_id = $2, updated_at = now()
        where id = $1 and channel_id = $3 and status = 'rendering'`,
      [workflow.id, job.externalJobId, channelId],
    );
    return NextResponse.json({ status: "submitted", workflowId: workflow.id, providerJobId: job.externalJobId });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PROVIDER_FAILED";
    await database().query(
      `update public.production_workflows
          set status = 'failed', current_step = 'failed', error_code = $2, updated_at = now()
        where id = $1 and channel_id = $3 and status = 'rendering'`,
      [workflow.id, code, channelId],
    );
    return NextResponse.json({ status: "failed", workflowId: workflow.id, code }, { status: 502 });
  }
}
