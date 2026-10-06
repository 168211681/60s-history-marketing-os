"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectRecord } from "@/lib/clipforge/data";

export function ProjectForm({ project }: { project?: ProjectRecord }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", {
      method: project ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        code: form.get("code"),
        description: form.get("description"),
        status: form.get("status"),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Could not save the project.");
      setBusy(false);
      return;
    }
    router.push(project ? `/projects/${project.id}` : `/projects/${payload.id}`);
    router.refresh();
  }
  async function archive() {
    if (!project) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error || "Could not archive the project.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        Name
        <input name="name" required maxLength={160} defaultValue={project?.name ?? ""} placeholder="Project name" />
      </label>
      <label>
        Short code
        <input name="code" maxLength={16} defaultValue={project?.code ?? ""} placeholder="H60" autoCapitalize="characters" />
      </label>
      <label>
        Description
        <textarea name="description" maxLength={4000} rows={3} defaultValue={project?.description ?? ""} />
      </label>
      <label>
        Status
        <select name="status" defaultValue={project?.status ?? "active"}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <div className="form-actions">
        <button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : project ? "Save project" : "Create project"}</button>
        {project && project.status !== "archived" ? (
          <button className="button secondary" type="button" disabled={busy} onClick={archive}>Archive project</button>
        ) : null}
      </div>
      {message ? <p className="error-text" role="alert">{message}</p> : null}
    </form>
  );
}
