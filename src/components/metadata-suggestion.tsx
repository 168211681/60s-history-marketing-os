"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SuggestionRecord } from "@/lib/clipforge/classification-store";

type SuggestionView = SuggestionRecord;

export function suggestionPanelState(input: {
  hasSuggestion: boolean;
  unavailable: boolean;
  generating: boolean;
  status: SuggestionRecord["status"] | null;
  stale: boolean;
}) {
  if (input.generating) return "Generating";
  if (input.unavailable && !input.hasSuggestion) return "AI provider unavailable";
  if (!input.hasSuggestion || !input.status) return "Not generated";
  if (input.status === "accepted") return "Accepted";
  if (input.status === "rejected") return "Rejected";
  if (input.status === "superseded") return "Superseded";
  if (input.stale) return "Stale";
  return "Pending review";
}

export function displayedSuggestionState(input: {
  server: { status: SuggestionRecord["status"]; stale: boolean } | null;
  confirmed: { status: SuggestionRecord["status"]; stale: boolean } | null;
  generating: boolean;
  unavailable: boolean;
}) {
  const suggestion = input.confirmed ?? input.server;
  return suggestionPanelState({
    hasSuggestion: Boolean(suggestion),
    unavailable: input.unavailable,
    generating: input.generating,
    status: suggestion?.status ?? null,
    stale: Boolean(suggestion?.stale),
  });
}

function isSuggestionView(value: unknown): value is SuggestionView {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SuggestionView>;
  const productionType = record.suggestedProductionType;
  return typeof record.id === "string"
    && (record.status === "pending" || record.status === "accepted" || record.status === "rejected" || record.status === "superseded")
    && typeof record.stale === "boolean"
    && (record.suggestedTopic === null || typeof record.suggestedTopic === "string")
    && (record.suggestedContentPillar === null || typeof record.suggestedContentPillar === "string")
    && (productionType === "unknown" || productionType === "new" || productionType === "remaster" || productionType === "repurpose" || productionType === "other")
    && (record.topicConfidence === null || typeof record.topicConfidence === "number")
    && (record.pillarConfidence === null || typeof record.pillarConfidence === "number")
    && (record.productionTypeConfidence === null || typeof record.productionTypeConfidence === "number")
    && typeof record.topicRationale === "string"
    && typeof record.pillarRationale === "string"
    && typeof record.productionTypeRationale === "string";
}

export function canRegenerateSuggestion(input: {
  hasSuggestion: boolean;
  status: SuggestionRecord["status"] | null;
  stale: boolean;
}) {
  if (!input.hasSuggestion) return true;
  if (input.stale) return true;
  return input.status === "superseded";
}

function confidenceLabel(value: number | null) {
  return value === null ? "No confidence score" : value.toFixed(2);
}

function Field({
  name,
  label,
  value,
  confidence,
  rationale,
  disabled,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  value: string | null;
  confidence: number | null;
  rationale: string;
  disabled: boolean;
  checked: boolean;
  onChange: (name: string, checked: boolean) => void;
}) {
  const offered = value !== null;
  return (
    <fieldset className="suggestion-field">
      <legend>{label}</legend>
      <p>{offered ? value : "No suggestion"}</p>
      <p className="muted">{confidenceLabel(confidence)}</p>
      <p className="pre-wrap">{rationale || "No rationale stored."}</p>
      {offered && !disabled ? (
        <label>
          <input type="checkbox" checked={checked} onChange={(event) => onChange(name, event.target.checked)} />
          Accept {label.toLowerCase()}
        </label>
      ) : null}
    </fieldset>
  );
}

export function MetadataSuggestionPanel({
  contentItemId,
  providerConfigured,
  suggestion,
}: {
  contentItemId: string;
  providerConfigured: boolean;
  suggestion: SuggestionView | null;
}) {
  const router = useRouter();
  const inflight = useRef(false);
  const serverSuggestion = useRef(suggestion);
  const [busy, setBusy] = useState<"generate" | "review" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!providerConfigured);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<SuggestionView | null>(null);
  const displayed = confirmed ?? suggestion;
  const stale = Boolean(displayed?.stale);
  const pending = displayed?.status === "pending" && !stale;
  const canGenerate = canRegenerateSuggestion({
    hasSuggestion: Boolean(displayed),
    status: displayed?.status ?? null,
    stale,
  });
  const state = displayedSuggestionState({
    server: suggestion ? { status: suggestion.status, stale: suggestion.stale } : null,
    confirmed: confirmed ? { status: confirmed.status, stale: confirmed.stale } : null,
    generating: busy === "generate",
    unavailable,
  });

  useEffect(() => {
    if (serverSuggestion.current === suggestion) return;
    serverSuggestion.current = suggestion;
    setConfirmed(null);
  }, [suggestion]);

  function toggle(name: string, checked: boolean) {
    setSelected((current) => checked ? [...current, name] : current.filter((field) => field !== name));
  }

  async function generate() {
    if (inflight.current) return;
    inflight.current = true;
    setBusy("generate");
    setMessage(null);
    try {
      const response = await fetch(`/api/content-items/${contentItemId}/classify`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string; suggestion?: unknown } | null;
      if (payload?.error === "AI_NOT_CONFIGURED") {
        setUnavailable(true);
        setMessage("The AI provider is not configured. No suggestion was stored.");
        return;
      }
      if (payload?.error === "CLASSIFICATION_INPUT_CHANGED") {
        setMessage("Source metadata changed while classification was running. Generate again.");
        return;
      }
      if (!response.ok || !isSuggestionView(payload?.suggestion)) {
        setMessage(payload?.error || "Could not generate a suggestion.");
        return;
      }
      setConfirmed(payload.suggestion);
      setSelected([]);
      router.refresh();
    } catch {
      setMessage("Could not generate a suggestion.");
    } finally {
      inflight.current = false;
      setBusy(null);
    }
  }

  async function review(action: "accept" | "reject") {
    if (!displayed || inflight.current) return;
    inflight.current = true;
    setBusy("review");
    setMessage(null);
    try {
      const response = await fetch(`/api/content-items/${contentItemId}/classification/${displayed.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, fields: action === "accept" ? selected : [] }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; suggestion?: unknown } | null;
      if (!response.ok || !isSuggestionView(payload?.suggestion)) {
        setMessage(payload?.error || "Could not review the suggestion.");
        return;
      }
      setConfirmed(payload.suggestion);
      setSelected([]);
      router.refresh();
    } catch {
      setMessage("Could not review the suggestion.");
    } finally {
      inflight.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="suggestion-panel">
      <p className="badge neutral">AI suggestion · not a source fact</p>
      <p>{state}</p>
      {unavailable && !displayed ? <p>No classifier is configured, so nothing was invented.</p> : null}
      {displayed && (displayed.status === "accepted" || displayed.status === "rejected") && stale ? (
        <p className="muted">Current metadata has changed since this decision. The suggestion stays {state.toLowerCase()}.</p>
      ) : null}
      {displayed ? (
        <>
          <Field name="topic" label="Topic" value={displayed.suggestedTopic} confidence={displayed.topicConfidence} rationale={displayed.topicRationale} disabled={!pending} checked={selected.includes("topic")} onChange={toggle} />
          <Field name="content_pillar" label="Content pillar" value={displayed.suggestedContentPillar} confidence={displayed.pillarConfidence} rationale={displayed.pillarRationale} disabled={!pending} checked={selected.includes("content_pillar")} onChange={toggle} />
          <Field name="production_type" label="Production type" value={displayed.suggestedProductionType} confidence={displayed.productionTypeConfidence} rationale={displayed.productionTypeRationale} disabled={!pending} checked={selected.includes("production_type")} onChange={toggle} />
        </>
      ) : null}
      <div className="form-actions">
        {canGenerate ? <button className="button" type="button" disabled={busy !== null} onClick={generate}>{busy === "generate" ? "Generating…" : stale ? "Regenerate" : "Generate suggestion"}</button> : null}
        {pending ? <button className="button" type="button" disabled={busy !== null || selected.length === 0} onClick={() => review("accept")}>Accept selected</button> : null}
        {pending ? <button className="button secondary" type="button" disabled={busy !== null} onClick={() => review("reject")}>Reject</button> : null}
      </div>
      {message ? <p className="error-text" role="alert">{message}</p> : null}
    </div>
  );
}
