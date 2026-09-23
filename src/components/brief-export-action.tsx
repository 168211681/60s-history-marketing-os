"use client";

import { useState } from "react";
import { scheduleObjectUrlCleanup } from "../lib/object-url";

export function BriefExportAction({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/scripts/${id}/export`, { credentials: "same-origin" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not export this brief");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `creative-brief-${id}.zip`;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      scheduleObjectUrlCleanup(url, (callback, delayMs) => window.setTimeout(callback, delayMs), (candidate) => URL.revokeObjectURL(candidate));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not export this brief");
    } finally {
      setBusy(false);
    }
  }
  return <span className="script-actions"><button className="button secondary" type="button" onClick={download} disabled={busy}>{busy ? "Preparing…" : "Export brief ZIP"}</button>{error ? <span className="error-text" role="alert">{error}</span> : null}</span>;
}
