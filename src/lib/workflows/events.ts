import { database } from "@/lib/database";

export type WorkflowEventType =
  | "claimed"
  | "submitted"
  | "polled"
  | "poll_failed"
  | "rendered"
  | "upload_started"
  | "uploaded_private"
  | "failed"
  | "retry_queued"
  | "published";

type WorkflowEvent = {
  workflowId: string;
  channelId: string;
  attempt: number;
  eventType: WorkflowEventType;
  status: "queued" | "rendering" | "rendered" | "uploaded_private" | "published" | "failed" | "cancelled";
  errorCode?: string | null;
  metadata?: Record<string, boolean | number | string>;
};

function safeMetadata(metadata: WorkflowEvent["metadata"]) {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => /^[a-z][a-z0-9_]{0,31}$/.test(key) && (typeof value !== "string" || value.length <= 200))
      .slice(0, 12),
  );
}

/** Telemetry must never change the outcome of the production worker. */
export async function recordWorkflowEvent(event: WorkflowEvent) {
  try {
    await database().query(
      `insert into private.production_workflow_events
         (workflow_id, channel_id, attempt, event_type, status, error_code, metadata)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        event.workflowId,
        event.channelId,
        Math.max(0, Math.min(10, Math.trunc(event.attempt))),
        event.eventType,
        event.status,
        event.errorCode ?? null,
        JSON.stringify(safeMetadata(event.metadata)),
      ],
    );
  } catch {
    // A telemetry outage must not stop rendering, upload, or retry processing.
  }
}
