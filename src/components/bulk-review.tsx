"use client";

import { useEffect, useRef, useState } from "react";
import { BULK_REVIEW_LIMIT, bulkFieldLabels, bulkFields, type BulkConfirmation, type BulkOutcome, type BulkPreview } from "@/lib/clipforge/bulk-review";
import type { ClassificationField } from "@/lib/clipforge/classification";
import { conciseRationale, reviewConfidence } from "@/lib/clipforge/review-queue";

export function BulkReview({ ids, lockSelection }: { ids: string[]; lockSelection: (locked: boolean) => void }) {
  const [preview, setPreview] = useState<BulkPreview | null>(null);
  const [fields, setFields] = useState<Record<string, ClassificationField[]>>({});
  const [confirmation, setConfirmation] = useState<BulkConfirmation | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    const leave = () => { alive.current = false; controller.current?.abort(); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    return () => { leave(); window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", restore); };
  }, []);
  useEffect(() => { if (preview || outcome || error) heading.current?.focus(); }, [preview, confirmation, outcome, error]);

  async function send(confirm: boolean, action?: "accept" | "reject", finalPreview = false) {
    if (inFlight.current || !alive.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); lockSelection(true);
    controller.current = new AbortController();
    const payload = confirm ? confirmation : finalPreview && preview ? {
      action: preview.action, items: preview.items.map((i) => ({ contentItemId: i.contentItemId, suggestionId: i.suggestionId, version: i.version, fields: fields[i.contentItemId] ?? [] })),
    } : { action, items: ids.map((id) => ({ contentItemId: id, fields: [] })) };
    try {
      const response = await fetch(`/api/content-items/bulk-review/${confirm ? "confirm" : "preview"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.current.signal,
      });
      const body = await response.json();
      if (!alive.current) return;
      if (!response.ok) {
        if (confirm && response.status >= 500) setUncertain(true);
        else { setPreview(null); setConfirmation(null); setUncertain(false); lockSelection(false); }
        setError(body.error ?? "Could not complete this request.");
        return;
      }
      if (confirm) { setOutcome(body); setPreview(null); setConfirmation(null); setUncertain(false); }
      else {
        const next = body as BulkPreview;
        setPreview(next);
        setFields(Object.fromEntries(next.items.map((i) => [i.contentItemId, i.fields])));
        setConfirmation(finalPreview && next.canConfirm ? {
          requestId: next.requestId, action: next.action,
          items: next.items.map((i) => ({ contentItemId: i.contentItemId, suggestionId: i.suggestionId!, version: i.version, fields: i.fields })),
        } : null);
      }
    } catch {
      if (!alive.current) return;
      if (confirm) { setUncertain(true); setError("The outcome is unknown. Retry this same confirmation to check safely."); }
      else { setPreview(null); setConfirmation(null); lockSelection(false); setError("Could not load the preview. Try again."); }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const ready = preview?.items.every((i) => i.eligible && (preview.action === "reject" || (fields[i.contentItemId]?.length ?? 0) > 0));
  return <section className="bulk-review" aria-label="Bulk metadata review" aria-busy={busy}>
    <h3 ref={heading} tabIndex={-1}>{outcome ? "Batch reviewed" : confirmation ? "Confirm reviewed batch" : preview ? "Inspect selected suggestions" : "Review selected clips"}</h3>
    <p>{ids.length} of {BULK_REVIEW_LIMIT} selected on this page. Only pending suggestions with unchanged sources are eligible.</p>
    {busy ? <p role="status">{confirmation ? "Checking and confirming the batch…" : "Loading a read-only preview…"}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {outcome ? <div role="status"><p>{outcome.affected} {outcome.affected === 1 ? "clip" : "clips"} {outcome.action === "accept" ? "accepted" : "rejected"}. All changes were saved together.</p><button className="button" onClick={() => window.location.reload()}>Refresh review queue</button></div> : null}
    {!preview && !outcome ? <div className="bulk-actions">
      <button className="button" disabled={!ids.length || busy} onClick={() => void send(false, "accept")}>Preview accept</button>
      <button className="button secondary" disabled={!ids.length || busy} onClick={() => void send(false, "reject")}>Preview reject</button>
    </div> : null}
    {preview ? <>
      <p>{confirmation ? `${preview.affected} ${preview.affected === 1 ? "clip" : "clips"} will be ${preview.action === "accept" ? "accepted using only the fields listed below" : "rejected"}. Confirm to save the entire batch.` : "Nothing has been changed. Inspect each clip before continuing."}</p>
      {preview.items.map((item) => <fieldset key={item.contentItemId} className="bulk-preview-item" disabled={busy || Boolean(confirmation)}>
        <legend>{item.title}</legend><p className="muted">{item.projectName}</p>
        {item.warnings.filter((w) => !w.startsWith("Choose at least")).map((w) => <p role="alert" key={w}>{w}</p>)}
        {bulkFields.map((field) => {
          const s = item.suggestion;
          const value = field === "topic" ? s?.suggestedTopic : field === "content_pillar" ? s?.suggestedContentPillar : s?.suggestedProductionType;
          const confidence = field === "topic" ? s?.topicConfidence : field === "content_pillar" ? s?.pillarConfidence : s?.productionTypeConfidence;
          const rationale = field === "topic" ? s?.topicRationale : field === "content_pillar" ? s?.pillarRationale : s?.productionTypeRationale;
          return <div className="bulk-preview-field" key={field}>
            <h4>{bulkFieldLabels[field]}</h4>
            <p>Current: <strong>{item.current[field] || "Not set"}</strong></p>
            <p>Suggested: <strong>{value ?? "No suggestion"}</strong></p>
            <p>Confidence: {reviewConfidence(confidence ?? null)}</p><p className="muted">{conciseRationale(rationale ?? "")}</p>
            {rationale && rationale.length > 240 ? <details><summary>Full explanation</summary><p className="muted">{rationale}</p></details> : null}
            {preview.action === "accept" ? <label className="bulk-checkbox"><input type="checkbox" aria-label={`Accept ${bulkFieldLabels[field].toLowerCase()} for ${item.title}`} checked={(fields[item.contentItemId] ?? []).includes(field)} disabled={!item.availableFields.includes(field)} onChange={(event) => {
              setFields((current) => ({ ...current, [item.contentItemId]: event.target.checked ? [...(current[item.contentItemId] ?? []), field] : current[item.contentItemId].filter((v) => v !== field) }));
            }} />Accept {bulkFieldLabels[field].toLowerCase()}{!item.availableFields.includes(field) ? " (unavailable for this clip)" : ""}</label> : null}
          </div>;
        })}
        {preview.action === "reject" ? <p>This pending suggestion will be rejected. Canonical metadata will stay unchanged.</p> : <p>Selected fields: {(fields[item.contentItemId] ?? []).map((f) => bulkFieldLabels[f]).join(", ") || "None — choose at least one"}</p>}
      </fieldset>)}
      <p>If any clip changed or is no longer eligible, the entire batch will be cancelled without saving any changes.</p>
      <div className="bulk-actions">
        {confirmation ? <button className="button" disabled={busy} onClick={() => void send(true)}>{uncertain ? "Retry same confirmation" : `Confirm ${preview.action} ${preview.affected} ${preview.affected === 1 ? "clip" : "clips"}`}</button> : <button className="button" disabled={busy || !ready} onClick={() => void send(false, undefined, true)}>Review batch</button>}
        <button className="button secondary" disabled={busy || uncertain} onClick={() => { setPreview(null); setConfirmation(null); setError(""); lockSelection(false); }}>Cancel preview</button>
      </div>
    </> : null}
  </section>;
}
