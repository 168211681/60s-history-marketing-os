"use client";

import { useState } from "react";

type WorkflowEvent = {
  id: string;
  eventType: string;
  status: string;
  errorCode: string | null;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

export function WorkflowEvents({ id }: { id: string }) {
  const [events, setEvents] = useState<WorkflowEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (events || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/workflows/${id}/events`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Could not load workflow history");
      const payload = (await response.json()) as { events?: WorkflowEvent[] };
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load workflow history");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="workflow-events" onToggle={(event) => { if (event.currentTarget.open) void load(); }}>
      <summary>View worker history</summary>
      {busy ? <p className="muted text-xs">Loading history…</p> : null}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      {events && !events.length ? <p className="muted text-xs">No telemetry recorded yet.</p> : null}
      {events?.length ? (
        <ol className="workflow-event-list">
          {events.map((item) => (
            <li key={item.id}>
              <span><strong>{item.eventType}</strong> · {item.status}{item.errorCode ? ` · ${item.errorCode}` : ""}</span>
              <time dateTime={item.createdAt}>{dateLabel(item.createdAt)} UTC</time>
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  );
}
