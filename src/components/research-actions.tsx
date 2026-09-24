"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ResearchProject } from "@/lib/research/model";

type Options = { ideas: { id: string; title: string }[]; experiments: { id: string; title: string | null }[]; drafts: { id: string; title: string }[] };

function message(value: unknown) { return value instanceof Error ? value.message : "Could not save research"; }

export function ResearchActions({ project, options }: { project?: ResearchProject; options?: Options }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, path: string, method: "POST" | "PATCH", data: Record<string, unknown>) {
    event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(null);
    try {
      const response = await fetch(path, { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const body = await response.json().catch(() => null) as { id?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save research");
      if (!project && body?.id) router.push(`/research/${body.id}`);
      else router.refresh();
      if (method === "POST") form.reset();
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  if (!project) return <form className="stack-md" onSubmit={(event) => {
    const form = new FormData(event.currentTarget);
    void submit(event, "/api/research", "POST", { topic: form.get("topic"), researchQuestion: form.get("researchQuestion"),
      contentIdeaId: form.get("contentIdeaId") || null, experimentId: form.get("experimentId") || null, scriptDraftId: form.get("scriptDraftId") || null });
  }}>
    <label>Topic <input className="input" name="topic" required maxLength={200} /></label>
    <label>Research question <textarea className="input" name="researchQuestion" maxLength={2000} /></label>
    <label>Content idea <select className="input" name="contentIdeaId"><option value="">None</option>{options?.ideas.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <label>Experiment <select className="input" name="experimentId"><option value="">None</option>{options?.experiments.map((item) => <option key={item.id} value={item.id}>{item.title ?? "Untitled legacy experiment"}</option>)}</select></label>
    <label>Script draft <select className="input" name="scriptDraftId"><option value="">None</option>{options?.drafts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <button className="button" disabled={busy}>{busy ? "Saving…" : "Create research project"}</button>
    {error && <p role="alert" className="error-text">{error}</p>}
  </form>;

  const base = `/api/research/${project.id}`;
  const locked = project.status === "approved" || project.status === "rejected";
  return <div className="stack-lg">
    {!locked && <>
      <form className="stack-md" onSubmit={(event) => { const form = new FormData(event.currentTarget); void submit(event, base, "PATCH", {
        researchQuestion: form.get("researchQuestion"), summary: form.get("summary"), confidenceNote: form.get("confidenceNote"),
        scriptDraftId: form.get("scriptDraftId") || null }); }}>
        <label>Research question <textarea className="input" name="researchQuestion" defaultValue={project.researchQuestion} maxLength={2000} /></label>
        <label>Summary <textarea className="input" name="summary" defaultValue={project.summary} maxLength={10000} /></label>
        <label>Uncertainty / confidence note <textarea className="input" name="confidenceNote" defaultValue={project.confidenceNote} maxLength={4000} /></label>
        <label>Linked script <select className="input" name="scriptDraftId" defaultValue={project.scriptDraftId ?? ""}><option value="">None</option>{options?.drafts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <button className="button secondary" disabled={busy}>Save research notes</button>
      </form>
      <form className="stack-md" onSubmit={(event) => { const form = new FormData(event.currentTarget); void submit(event, `${base}/sources`, "POST", {
        sourceType: form.get("sourceType"), title: form.get("title"), publisher: form.get("publisher"), author: form.get("author") || null,
        publishedAt: form.get("publishedAt") || null, url: form.get("url") || null, citationText: form.get("citationText"),
        notes: form.get("notes"), reliabilityNote: form.get("reliabilityNote") }); }}>
        <h3>Add source</h3>
        <label>Source category <select className="input" name="sourceType">{["primary", "academic", "museum_archive", "reference", "journalism", "general_web", "unknown"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label>Title <input className="input" name="title" required maxLength={500} /></label>
        <label>Publisher <input className="input" name="publisher" maxLength={300} /></label>
        <label>Author <input className="input" name="author" maxLength={300} /></label>
        <label>Publication date <input className="input" type="date" name="publishedAt" /></label>
        <label>HTTPS URL <input className="input" type="url" name="url" maxLength={2000} /></label>
        <label>Exact citation / source observation <textarea className="input" name="citationText" required maxLength={4000} /></label>
        <label>Source limitations <textarea className="input" name="reliabilityNote" maxLength={4000} /></label>
        <label>Notes <textarea className="input" name="notes" maxLength={4000} /></label>
        <button className="button secondary" disabled={busy}>Add source</button>
      </form>
      <form className="stack-md" onSubmit={(event) => { const form = new FormData(event.currentTarget); void submit(event, `${base}/claims`, "POST", { claimText: form.get("claimText") }); }}>
        <h3>Add claim to assess</h3><label>Historical claim <textarea className="input" name="claimText" required maxLength={4000} /></label>
        <button className="button secondary" disabled={busy}>Add unverified claim</button>
      </form>
      <div className="stack-md"><h3>Review state</h3>{({ draft: ["researching", "rejected"], researching: ["review", "rejected"], review: ["researching", "approved", "rejected"], approved: [], rejected: [] } as Record<string, string[]>)[project.status].map((status) => <button key={status} type="button" className="button secondary" disabled={busy} onClick={() => {
        setBusy(true); setError(null); void fetch(base, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) })
          .then(async (response) => { const body = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(body?.error ?? "Could not change status"); router.refresh(); })
          .catch((cause) => setError(message(cause))).finally(() => setBusy(false));
      }}>{status === "approved" ? "Approve research package" : `Move to ${status}`}</button>)}</div>
    </>}
    {project.claims.map((claim) => <section key={claim.id} className="panel stack-md">
      <h3>{claim.claimText}</h3><p className="muted">Assessment: {claim.verdict} · confidence: {claim.confidence}</p>
      {claim.reviewerNote && <p>{claim.reviewerNote}</p>}
      <p className="muted">Sources: {claim.sources.map((link) => `${project.sources.find((source) => source.id === link.sourceId)?.title ?? "Unknown"} (${link.relationship})`).join(", ") || "none"}</p>
      {!locked && <>
        <form className="stack-md" onSubmit={(event) => { const form = new FormData(event.currentTarget); void submit(event, `${base}/claims/${claim.id}/sources`, "POST", { sourceId: form.get("sourceId"), relationship: form.get("relationship") }); }}>
          <label>Evidence source <select className="input" name="sourceId" required><option value="">Select source</option>{project.sources.filter((source) => !claim.sources.some((link) => link.sourceId === source.id)).map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
          <label>Relationship <select className="input" name="relationship"><option value="supports">Supports</option><option value="contradicts">Contradicts</option><option value="contextualizes">Contextualizes</option></select></label>
          <button className="button secondary" disabled={busy || !project.sources.length}>Link source</button>
        </form>
        <form className="stack-md" onSubmit={(event) => { const form = new FormData(event.currentTarget); void submit(event, `${base}/claims/${claim.id}`, "PATCH", { verdict: form.get("verdict"), confidence: form.get("confidence"), reviewerNote: form.get("reviewerNote") }); }}>
          <label>Verdict <select className="input" name="verdict" defaultValue={claim.verdict}>{["insufficient", "supported", "disputed", "false", "contextual"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Confidence <select className="input" name="confidence" defaultValue={claim.confidence}>{["low", "medium", "high"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Reviewer note <textarea className="input" name="reviewerNote" defaultValue={claim.reviewerNote} maxLength={4000} /></label>
          <button className="button secondary" disabled={busy}>Save assessment</button>
        </form>
      </>}
    </section>)}
    {error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}
