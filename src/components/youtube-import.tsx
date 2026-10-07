"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ImportPreview = {
  projectName: string;
  channelTitles: string[];
  found: number;
  newItems: number;
  alreadyImported: number;
  invalid: number;
};

type ImportResult = {
  found: number;
  created: number;
  alreadyLinked: number;
  updated: number;
  skipped: number;
};

export function youtubeImportActionLabel(newItems: number) {
  return newItems > 0 ? `Import ${newItems} videos` : "Import again";
}

export function YoutubeImportView({
  projectId,
  projectName,
  preview,
  result,
  message,
}: {
  projectId: string;
  projectName: string;
  preview: ImportPreview | null;
  result: ImportResult | null;
  message: string | null;
}) {
  const channels = preview?.channelTitles.length ? preview.channelTitles.join(", ") : "No stored YouTube channel";
  return (
    <div className="import-panel">
      <p>Source: YouTube</p>
      <p className="muted">Counts come from videos already stored for this account. Preview does not write. Import does not upload or publish anything.</p>
      {preview ? (
        <>
          <p>{channels}</p>
          <dl className="definition-list">
            <div><dt>Videos found</dt><dd>{preview.found}</dd></div>
            <div><dt>New</dt><dd>{preview.newItems}</dd></div>
            <div><dt>Already imported</dt><dd>{preview.alreadyImported}</dd></div>
            <div><dt>Invalid</dt><dd>{preview.invalid}</dd></div>
          </dl>
          <p>Project: {projectName}</p>
        </>
      ) : (
        <p className="muted">Preview the stored YouTube library before importing.</p>
      )}
      {result ? (
        <>
          <dl className="definition-list">
            <div><dt>Found</dt><dd>{result.found}</dd></div>
            <div><dt>Created</dt><dd>{result.created}</dd></div>
            <div><dt>Already linked</dt><dd>{result.alreadyLinked}</dd></div>
            <div><dt>Updated</dt><dd>{result.updated}</dd></div>
            <div><dt>Skipped</dt><dd>{result.skipped}</dd></div>
          </dl>
          <a className="text-link" href={`/library?project=${projectId}`}>View imported content in the library</a>
        </>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}

export function YoutubeImportPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  async function run(path: string, mode: "preview" | "import") {
    setBusy(mode);
    setMessage(null);
    try {
      const response = await fetch(path, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(typeof payload?.error === "string" ? payload.error : "The YouTube import could not be completed.");
        return;
      }
      if (mode === "preview") {
        setPreview(payload as ImportPreview);
        setResult(null);
      } else {
        setResult(payload as ImportResult);
        router.refresh();
      }
    } catch {
      setMessage("The YouTube import could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="import-panel">
      <YoutubeImportView projectId={projectId} projectName={projectName} preview={preview} result={result} message={message} />
      <div className="form-actions">
        <button className="button secondary" type="button" disabled={busy !== null} onClick={() => void run(`/api/projects/${projectId}/youtube-import/preview`, "preview")}>
          {busy === "preview" ? "Previewing…" : "Preview import"}
        </button>
        {preview ? (
          <button className="button" type="button" disabled={busy !== null} onClick={() => void run(`/api/projects/${projectId}/youtube-import`, "import")}>
            {busy === "import" ? "Importing…" : youtubeImportActionLabel(preview.newItems)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
