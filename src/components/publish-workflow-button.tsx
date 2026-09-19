"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishWorkflowButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/workflows/${id}/publish`, { method: "POST", credentials: "same-origin" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not publish video");
      setMessage("Published publicly.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish video");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="script-actions">
      <button className="button" type="button" onClick={publish} disabled={busy}>
        {busy ? "Publishing…" : "Publish publicly"}
      </button>
      <span className="muted" role="status">This is the final human approval.</span>
      {message ? <span className="muted" role="status">{message}</span> : null}
    </div>
  );
}
