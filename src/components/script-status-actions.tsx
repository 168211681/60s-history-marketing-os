"use client";

import { useState } from "react";
import type { ScriptStatus } from "@/lib/data/script-status";

export function ScriptStatusActions({ id, status }: { id: string; status: ScriptStatus }) {
  const [current, setCurrent] = useState(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = current === "draft" ? "reviewed" : current === "reviewed" ? "approved" : null;
  async function startWorkflow() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/scripts/${id}/workflow`, { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error(await response.text());
      setError("Production workflow queued.");
    } catch (value) { setError(value instanceof Error ? value.message : "Could not start workflow"); }
    finally { setBusy(false); }
  }
  if (current === "approved") return <div className="script-actions"><button className="button" type="button" onClick={startWorkflow} disabled={busy}>{busy ? "Starting…" : "Start production"}</button>{error ? <span className="muted" role="status">{error}</span> : null}</div>;
  if (!next) return null;
  const target = next;

  async function advance() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/scripts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: target }),
      });
      if (!response.ok) throw new Error("Could not update this draft");
      setCurrent(target);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not update this draft");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="script-actions">
      <button className="button secondary" type="button" onClick={advance} disabled={busy}>
        {busy ? "Saving…" : target === "reviewed" ? "Mark reviewed" : "Approve draft"}
      </button>
      {error ? <span className="error-text" role="alert">{error}</span> : null}
    </div>
  );
}
