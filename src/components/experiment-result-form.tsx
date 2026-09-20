"use client";

import { useState } from "react";

export function ExperimentResultForm({ id }: { id: string }) {
  const [status, setStatus] = useState("completed");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(form: HTMLFormElement) {
    setBusy(true); setMessage(null);
    const data = new FormData(form);
    const number = (name: string) => { const value = String(data.get(name) ?? "").trim(); return value ? Number(value) : null; };
    try {
      const response = await fetch(`/api/experiments/${id}`, {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, resultSummary: String(data.get("resultSummary") ?? ""), recommendation: String(data.get("recommendation") ?? ""), videoId: String(data.get("videoId") ?? "").trim() || undefined, views: number("views"), minutesWatched: number("minutesWatched"), averageViewDurationSeconds: number("averageViewDurationSeconds"), likes: number("likes"), comments: number("comments") }),
      });
      if (!response.ok) throw new Error(await response.text());
      setMessage("Experiment result saved. Refresh to see the updated recommendation.");
      form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save experiment result"); }
    finally { setBusy(false); }
  }
  return <form className="stack-md" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
    <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="completed">Completed</option><option value="running">Running</option><option value="cancelled">Cancelled</option></select></label>
    <label>Observed result<textarea name="resultSummary" required maxLength={10000} placeholder="What happened in the reporting window?" /></label>
    <label>Recommendation<textarea name="recommendation" required maxLength={5000} placeholder="What should the next experiment do?" /></label>
    <div className="form-grid"><label>Views<input name="views" type="number" min="0" step="1" /></label><label>Minutes watched<input name="minutesWatched" type="number" min="0" step="any" /></label><label>Avg. duration (seconds)<input name="averageViewDurationSeconds" type="number" min="0" step="any" /></label><label>Likes<input name="likes" type="number" min="0" step="1" /></label><label>Comments<input name="comments" type="number" min="0" step="1" /></label><label>Stored video UUID<input name="videoId" placeholder="Optional UUID" /></label></div>
    <button className="button secondary" type="submit" disabled={busy}>{busy ? "Saving…" : "Record result"}</button>
    {message ? <p className="muted" role="status">{message}</p> : null}
  </form>;
}
