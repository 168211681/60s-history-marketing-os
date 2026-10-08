"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContentRecord, ProjectRecord } from "@/lib/clipforge/data";
import { h60Pillars, h60ProjectCode, isH60Pillar } from "@/lib/clipforge/pillars";

export function ContentItemFields({
  item,
  projects,
  defaultProjectId,
}: {
  item?: ContentRecord;
  projects: readonly Pick<ProjectRecord, "id" | "name" | "code">[];
  defaultProjectId?: string;
}) {
  const initialProject = item?.projectId ?? defaultProjectId ?? "";
  const [projectId, setProjectId] = useState(initialProject);
  const projectCode = projects.find((project) => project.id === projectId)?.code ?? null;
  const historyProject = projectCode === h60ProjectCode;
  const pillarOnThisProject = item && item.projectId === projectId ? item.contentPillar : "";
  const historyPillar = isH60Pillar(pillarOnThisProject) ? pillarOnThisProject : "";
  return (
    <>
      <label>
        Project
        <select name="projectId" required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="" disabled>Select a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.code ? `${project.code} · ` : ""}{project.name}</option>
          ))}
        </select>
      </label>
      <label>
        Title
        <input name="title" required maxLength={200} defaultValue={item?.title ?? ""} />
      </label>
      <label>
        Topic
        <input name="topic" maxLength={200} defaultValue={item?.topic ?? ""} placeholder="Optional" />
      </label>
      <label>
        Content pillar
        {historyProject ? (
          <select key={`pillar-${projectId}`} name="contentPillar" defaultValue={historyPillar}>
            <option value="">None</option>
            {h60Pillars.map((pillar) => <option key={pillar} value={pillar}>{pillar}</option>)}
          </select>
        ) : (
          <input key={`pillar-${projectId}`} name="contentPillar" maxLength={80} defaultValue={pillarOnThisProject} placeholder="Optional" />
        )}
      </label>
      <label>
        Format
        <select name="format" defaultValue={item?.format ?? "unknown"}>
          <option value="unknown">Unknown</option>
          <option value="short_form">Short form</option>
          <option value="long_form">Long form</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Production type
        <select name="productionType" defaultValue={item?.productionType ?? "unknown"}>
          <option value="unknown">Unknown</option>
          <option value="new">New</option>
          <option value="remaster">Remaster</option>
          <option value="repurpose">Repurpose</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Status
        <select name="status" defaultValue={item?.status ?? "idea"}>
          <option value="idea">Idea</option>
          <option value="generating">Generating</option>
          <option value="editing">Editing</option>
          <option value="ready">Ready</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label>
        Notes
        <textarea name="notes" maxLength={8000} rows={4} defaultValue={item?.notes ?? ""} placeholder="Optional" />
      </label>
      <details className="advanced-fields">
        <summary>Advanced metadata</summary>
        <div className="form-grid">
          <label>
            Content key
            <input name="contentKey" maxLength={32} defaultValue={item?.contentKey ?? ""} placeholder="Optional" autoCapitalize="characters" />
          </label>
          <label>
            Language
            <input name="languageCode" maxLength={12} defaultValue={item?.languageCode ?? "und"} />
          </label>
          <label>
            Duration in seconds
            <input name="durationSeconds" inputMode="numeric" min={0} max={86400} defaultValue={item?.durationSeconds ?? ""} placeholder="Leave blank if unknown" />
          </label>
        </div>
      </details>
    </>
  );
}

export function ContentItemForm({
  item,
  projects,
  defaultProjectId,
}: {
  item?: ContentRecord;
  projects: readonly Pick<ProjectRecord, "id" | "name" | "code">[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send(body: Record<string, FormDataEntryValue | null>) {
    const response = await fetch(item ? `/api/content-items/${item.id}` : "/api/content-items", {
      method: item ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Could not save the content item.");
      setBusy(false);
      return;
    }
    router.push(`/library/${item?.id ?? payload.id}`);
    router.refresh();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    await send({
      projectId: form.get("projectId"),
      contentKey: form.get("contentKey"),
      title: form.get("title"),
      topic: form.get("topic"),
      contentPillar: form.get("contentPillar"),
      format: form.get("format"),
      productionType: form.get("productionType"),
      status: form.get("status"),
      languageCode: form.get("languageCode"),
      durationSeconds: form.get("durationSeconds"),
      notes: form.get("notes"),
    });
  }
  async function archive() {
    if (!item) return;
    setBusy(true);
    setMessage(null);
    await send({ status: "archived" });
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <ContentItemFields item={item} projects={projects} defaultProjectId={defaultProjectId} />
      <div className="form-actions">
        <button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : item ? "Save content" : "Create content"}</button>
        {item && item.status !== "archived" ? (
          <button className="button secondary" type="button" disabled={busy} onClick={archive}>Archive content</button>
        ) : null}
      </div>
      {message ? <p className="error-text" role="alert">{message}</p> : null}
    </form>
  );
}
