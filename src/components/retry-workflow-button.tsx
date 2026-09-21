"use client";

import { useState } from "react";

export function RetryWorkflowButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/workflows/${id}/retry`, { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error(await response.text());
      setMessage("Queued again. Run the worker to retry.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not retry workflow");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="script-actions">
      <button className="button secondary" type="button" onClick={retry} disabled={busy}>
        {busy ? "Retrying…" : "Retry"}
      </button>
      {message ? <span className="muted" role="status">{message}</span> : null}
    </span>
  );
}
