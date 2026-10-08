"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui";
import {
  BATCH_CLASSIFICATION_LIMIT,
  BATCH_PER_RUN_LIMIT_MESSAGE,
  batchOutcomeLabel,
  batchProgressLabel,
  claimBatchRun,
  generationQueue,
  isBatchPreview,
  releaseBatchRun,
  runBatchClassification,
  toggleBatchSelection,
  type BatchItemResult,
  type BatchPreview,
} from "@/lib/clipforge/batch-classification";

export type LibraryBatchItem = {
  id: string;
  title: string;
  projectCode: string | null;
  projectName: string;
  contentKey: string | null;
  formatLabel: string;
  productionTypeLabel: string;
  statusLabel: string;
  distributionComplete: number;
  hasMasterVideo: boolean;
  hasThumbnail: boolean;
  updatedLabel: string;
};

function actionNote(action: BatchPreview["items"][number]["action"]) {
  if (action === "generate") return "Needs a new classification request.";
  if (action === "decide") return "Stale — review this clip separately. This run will not classify it.";
  return "Skipped — a current suggestion already exists.";
}

export function LibraryBatch({ items }: { items: LibraryBatchItem[] }) {
  const inflight = useRef(false);
  const stopped = useRef(false);
  const mounted = useRef(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<"preview" | "run" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectedSelection, setRejectedSelection] = useState(false);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [results, setResults] = useState<BatchItemResult[] | null>(null);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    mounted.current = true;
    const stop = () => {
      stopped.current = true;
    };
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      stopped.current = true;
      window.removeEventListener("pagehide", stop);
    };
  }, []);

  function toggle(id: string) {
    if (busy) return;
    const next = toggleBatchSelection(selected, id);
    setSelected(next.selected);
    setRejectedSelection(next.rejected);
    setPreview(null);
    setResults(null);
    setMessage(null);
  }

  async function previewBatch() {
    if (!claimBatchRun(inflight)) return;
    setBusy("preview");
    setMessage(null);
    setResults(null);
    try {
      const response = await fetch("/api/content-items/classification-batch/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | BatchPreview | null;
      if (!mounted.current) return;
      if (!response.ok || !isBatchPreview(payload)) {
        setPreview(null);
        setMessage(payload && "error" in payload && payload.error ? payload.error : "Could not preview that batch.");
        return;
      }
      const allowed = new Set(selected);
      if (payload.items.some((item) => !allowed.has(item.id))) {
        setPreview(null);
        setMessage("Could not preview that batch.");
        return;
      }
      setPreview(payload);
    } catch {
      if (mounted.current) setMessage("Could not preview that batch.");
    } finally {
      releaseBatchRun(inflight);
      if (mounted.current) setBusy(null);
    }
  }

  async function confirmBatch() {
    if (!preview || !claimBatchRun(inflight)) return;
    const queue = generationQueue(preview.items).filter((item) => selected.includes(item.id));
    if (!queue.length) {
      releaseBatchRun(inflight);
      return;
    }
    stopped.current = false;
    setBusy("run");
    setMessage(null);
    setCompleted(0);
    setTotal(queue.length);
    try {
      const runResults = await runBatchClassification({
        queue,
        shouldContinue: () => !stopped.current,
        onProgress: (event) => {
          if (!mounted.current) return;
          setCompleted(event.completed);
          setTotal(event.total);
          setResults(event.results);
        },
        classify: async (id) => {
          const response = await fetch(`/api/content-items/${id}/classify`, { method: "POST" });
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          if (!response.ok) return { ok: false as const, status: response.status, error: payload?.error ?? null };
          return { ok: true as const };
        },
      });
      if (mounted.current) setResults(runResults);
    } catch {
      if (mounted.current) setMessage("Could not generate suggestions.");
    } finally {
      releaseBatchRun(inflight);
      if (mounted.current) setBusy(null);
    }
  }

  const atLimit = selected.length >= BATCH_CLASSIFICATION_LIMIT;
  const visiblePreview = preview?.items.filter((item) => selected.includes(item.id)) ?? [];
  const runnable = generationQueue(visiblePreview);
  const skippedCount = visiblePreview.filter((item) => item.action === "skip").length;
  const separateCount = visiblePreview.filter((item) => item.action === "decide").length;
  const progress = total > 0 ? batchProgressLabel(completed, total) : null;

  return (
    <>
      <Panel title="Batch classification" description="Choose clips from this filtered list, preview them, then confirm. Suggestions stay reviewable on each clip.">
        <div className="batch-classification">
          <p>{BATCH_PER_RUN_LIMIT_MESSAGE} Nothing is accepted for you.</p>
          <p className="muted">{selected.length} selected. Search and filters above still apply only to your library.</p>
          {rejectedSelection ? <p className="error-text" role="alert">{BATCH_PER_RUN_LIMIT_MESSAGE}</p> : null}
          <div className="form-actions batch-actions">
            <button className="button" type="button" disabled={busy !== null || selected.length === 0} onClick={previewBatch}>
              {busy === "preview" ? "Previewing…" : "Preview batch"}
            </button>
          </div>
          {preview ? (
            <>
              <p>
                About {runnable.length} new classification {runnable.length === 1 ? "request" : "requests"}.
                No price is shown because token usage and provider rates are not measured.
                {skippedCount} skipped. {separateCount} need a separate decision.
              </p>
              <ul className="batch-list">
                {preview.items.map((item) => (
                  <li key={item.id}>
                    <Link href={`/library/${item.id}`}>{item.title}</Link>
                    <p>{item.state} · {item.projectName}</p>
                    <p className="muted">{actionNote(item.action)}</p>
                  </li>
                ))}
              </ul>
              {runnable.length > 0 ? (
                <div className="form-actions batch-actions">
                  <button className="button" type="button" disabled={busy !== null} onClick={confirmBatch}>
                    {busy === "run" && progress ? `Classifying ${progress}` : "Confirm and generate"}
                  </button>
                </div>
              ) : (
                <p>Nothing new to classify. Current suggestions were skipped. Stale clips stay on their own pages.</p>
              )}
            </>
          ) : null}
          {busy === "run" && progress ? <p aria-live="polite">Progress {progress}</p> : null}
          {results?.length ? (
            <ol className="batch-list">
              {results.map((item) => (
                <li key={item.id}>
                  <Link href={`/library/${item.id}`}>{item.title}</Link>
                  <p>{batchOutcomeLabel(item.outcome)}</p>
                  <p className="muted">{item.detail}</p>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="muted">Leaving this page stops the next request. Suggestions already stored stay saved. Preview again to continue; current suggestions are skipped.</p>
          {message ? <p className="error-text" role="alert">{message}</p> : null}
        </div>
      </Panel>
      <Panel title="Content items" description="Select up to 5 for one classification run.">
        <ul className="content-cards">
          {items.map((item) => {
            const checked = selected.includes(item.id);
            return (
              <li key={item.id}>
                <label className="batch-select">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.title} for batch classification`}
                    checked={checked}
                    disabled={busy !== null || (!checked && atLimit)}
                    onChange={() => toggle(item.id)}
                  />
                  Select
                </label>
                <div className="batch-card">
                  <p className="eyebrow">{item.contentKey ?? "No key"}</p>
                  <h3><Link href={`/library/${item.id}`}>{item.title}</Link></h3>
                  <p className="muted">{item.projectCode ? `${item.projectCode} · ` : ""}{item.projectName}</p>
                  <p className="content-meta">
                    <span className="badge neutral">{item.formatLabel}</span>
                    <span className="badge neutral">{item.productionTypeLabel}</span>
                    <span className="badge neutral">{item.statusLabel}</span>
                    <span className="badge neutral">{item.distributionComplete}/4 complete</span>
                    <span className="badge neutral">{item.hasMasterVideo ? "Master video" : "No master video"}</span>
                    <span className="badge neutral">{item.hasThumbnail ? "Thumbnail" : "No thumbnail"}</span>
                    <span className="muted">Updated {item.updatedLabel} UTC</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
