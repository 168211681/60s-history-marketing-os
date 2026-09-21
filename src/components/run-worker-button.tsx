"use client";

import { useState } from "react";

export function RunWorkerButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/workflows/run", { method: "POST", credentials: "same-origin" });
      const body = await response.text();
      if (!response.ok) throw new Error(body || "Worker failed");
      setMessage("Worker ran successfully. Refresh to see the latest status.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Worker failed"); }
    finally { setBusy(false); }
  }
  return <div className="script-actions"><button className="button secondary" type="button" onClick={run} disabled={busy}>{busy ? "Running…" : "Run worker now"}</button>{message ? <span className="muted" role="status">{message}</span> : null}</div>;
}
