"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [busy, setBusy] = useState<"generate" | "review" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!providerConfigured);
  const [selected, setSelected] = useState<string[]>([]);
  const stale = Boolean(suggestion?.stale);
  const pending = suggestion?.status === "pending" && !stale;
  const canGenerate = canRegenerateSuggestion({
    hasSuggestion: Boolean(suggestion),
    status: suggestion?.status ?? null,
    stale,
  });
  const state = suggestionPanelState({
    hasSuggestion: Boolean(suggestion),
    unavailable,
    generating: busy === "generate",
    status: suggestion?.status ?? null,
    stale,
  });

  function toggle(name: string, checked: boolean) {
    setSelected((current) => checked ? [...current, name] : current.filter((field) => field !== name));
  }

  async function generate() {
    setBusy("generate");
    setMessage(null);
    const response = await fetch(`/api/content-items/${contentItemId}/classify`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    setBusy(null);
    if (payload?.error === "AI_NOT_CONFIGURED") {
      setUnavailable(true);
      setMessage("The AI provider is not configured. No suggestion was stored.");
      return;
    }
    if (payload?.error === "CLASSIFICATION_INPUT_CHANGED") {
      setMessage("Source metadata changed while classification was running. Generate again.");
      return;
    }
    if (!response.ok) {
      setMessage(payload?.error || "Could not generate a suggestion.");
      return;
    }
    setSelected([]);
    router.refresh();
  }

  async function review(action: "accept" | "reject") {
    if (!suggestion) return;
    setBusy("review");
    setMessage(null);
    const response = await fetch(`/api/content-items/${contentItemId}/classification/${suggestion.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, fields: action === "accept" ? selected : [] }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(null);
    if (!response.ok) {
      setMessage(payload?.error || "Could not review the suggestion.");
      return;
    }
    setSelected([]);
    router.refresh();
  }

  return (
    <div className="suggestion-panel">
      <p className="badge neutral">AI suggestion · not a source fact</p>
      <p>{state}</p>
      {unavailable && !suggestion ? <p>No classifier is configured, so nothing was invented.</p> : null}
      {suggestion && (suggestion.status === "accepted" || suggestion.status === "rejected") && stale ? (
        <p className="muted">Current metadata has changed since this decision. The suggestion stays {state.toLowerCase()}.</p>
      ) : null}
      {suggestion ? (
        <>
          <Field name="topic" label="Topic" value={suggestion.suggestedTopic} confidence={suggestion.topicConfidence} rationale={suggestion.topicRationale} disabled={!pending} checked={selected.includes("topic")} onChange={toggle} />
          <Field name="content_pillar" label="Content pillar" value={suggestion.suggestedContentPillar} confidence={suggestion.pillarConfidence} rationale={suggestion.pillarRationale} disabled={!pending} checked={selected.includes("content_pillar")} onChange={toggle} />
          <Field name="production_type" label="Production type" value={suggestion.suggestedProductionType} confidence={suggestion.productionTypeConfidence} rationale={suggestion.productionTypeRationale} disabled={!pending} checked={selected.includes("production_type")} onChange={toggle} />
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
