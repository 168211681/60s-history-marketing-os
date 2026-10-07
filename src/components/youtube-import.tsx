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
  return newItems > 0 ? `Import ${newItems} videos` : "Nothing to import";
}

export function YoutubeImportButton({
  newItems,
  importing,
  locked,
  onImport,
}: {
  newItems: number;
  importing: boolean;
  locked: boolean;
  onImport?: () => void;
}) {
  return (
    <button className="button" type="button" disabled={locked || newItems <= 0} onClick={onImport}>
      {importing ? "Importing…" : youtubeImportActionLabel(newItems)}
    </button>
  );
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

  async function readPayload(response: Response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(typeof payload?.error === "string" ? payload.error : "The YouTube import could not be completed.");
      return null;
    }
    return payload;
  }

  async function previewLibrary() {
    setBusy("preview");
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/youtube-import/preview`, { method: "POST" });
      const payload = await readPayload(response);
      if (!payload) return;
      setPreview(payload as ImportPreview);
      setResult(null);
    } catch {
      setMessage("The YouTube import could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  async function importLibrary() {
    if (!preview || preview.newItems <= 0) return;
    setBusy("import");
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/youtube-import`, { method: "POST" });
      const payload = await readPayload(response);
      if (!payload) return;
      setResult(payload as ImportResult);
      router.refresh();
      const refreshed = await fetch(`/api/projects/${projectId}/youtube-import/preview`, { method: "POST" });
      const counts = await readPayload(refreshed);
      if (counts) setPreview(counts as ImportPreview);
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
        <button className="button secondary" type="button" disabled={busy !== null} onClick={() => void previewLibrary()}>
          {busy === "preview" ? "Previewing…" : "Preview import"}
        </button>
        {preview ? (
          <YoutubeImportButton
            newItems={preview.newItems}
            importing={busy === "import"}
            locked={busy !== null}
            onImport={() => void importLibrary()}
          />
        ) : null}
      </div>
    </div>
  );
}
