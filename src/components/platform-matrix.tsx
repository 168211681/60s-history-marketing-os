"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import type { PlatformPostRecord } from "@/lib/clipforge/data";
import { platformCopyAll, platformStatuses, type PlatformStatus } from "@/lib/clipforge/distribution";
import { clipforgeLabel } from "@/lib/clipforge/labels";

export function PlatformCopyButtons({
  post,
  onCopy,
}: {
  post: { title: string; caption: string; hashtags: string };
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <>
      <button className="button secondary" type="button" onClick={() => onCopy("Title", post.title)}>Copy title</button>
      <button className="button secondary" type="button" onClick={() => onCopy("Caption", post.caption)}>Copy caption</button>
      <button className="button secondary" type="button" onClick={() => onCopy("Hashtags", post.hashtags)}>Copy hashtags</button>
      <button className="button secondary" type="button" onClick={() => onCopy("Post copy", platformCopyAll(post))}>Copy all</button>
    </>
  );
}

function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PlatformMatrix({
  contentItemId,
  posts,
}: {
  contentItemId: string;
  posts: readonly PlatformPostRecord[];
}) {
  return (
    <div className="platform-grid">
      {posts.map((post) => <PlatformCard key={post.id} contentItemId={contentItemId} post={post} />)}
    </div>
  );
}

function PlatformCard({ contentItemId, post }: { contentItemId: string; post: PlatformPostRecord }) {
  const router = useRouter();
  const [status, setStatus] = useState<PlatformStatus>(post.status);
  const [title, setTitle] = useState(post.title);
  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState(post.hashtags);
  const [scheduledAt, setScheduledAt] = useState(localInput(post.scheduledAt));
  const [publishedAt, setPublishedAt] = useState(localInput(post.publishedAt));
  const [postUrl, setPostUrl] = useState(post.postUrl ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value ? `${label} copied.` : `${label} is empty.`);
    } catch {
      setCopied("Copy failed. Select the text and copy it manually.");
    }
  }

  async function save(nextStatus?: PlatformStatus) {
    const statusToSave = nextStatus ?? status;
    if (statusToSave === "scheduled" && !scheduledAt) {
      setMessage("A scheduled post needs a scheduled time.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/content-items/${contentItemId}/platform-posts/${post.platform}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: statusToSave,
        title,
        caption,
        hashtags,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        postUrl: postUrl.trim() ? postUrl.trim() : null,
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setMessage(payload?.error || "Could not save this platform.");
      return;
    }
    setStatus(statusToSave);
    setMessage(`${clipforgeLabel(post.platform)} saved. Nothing was published to the platform.`);
    router.refresh();
  }

  return (
    <section className="platform-card">
      <div className="platform-heading">
        <h3>{clipforgeLabel(post.platform)}</h3>
        <span className="badge neutral">{clipforgeLabel(status)}</span>
      </div>
      <div className="form-grid">
        <label>Status
          <select value={status} onChange={(event) => setStatus(event.target.value as PlatformStatus)}>
            {platformStatuses.map((value) => <option key={value} value={value}>{clipforgeLabel(value)}</option>)}
          </select>
        </label>
        <label>Title
          <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>Caption
          <textarea value={caption} maxLength={5000} rows={4} onChange={(event) => setCaption(event.target.value)} />
        </label>
        <label>Hashtags
          <input value={hashtags} maxLength={500} onChange={(event) => setHashtags(event.target.value)} />
        </label>
        <label>Scheduled time
          <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
        </label>
        <p className="muted">Saved scheduled time: <LocalTime value={post.scheduledAt} /></p>
        <label>Published time
          <input type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} />
        </label>
        <p className="muted">Saved published time: <LocalTime value={post.publishedAt} /></p>
        <label>Post URL
          <input type="url" inputMode="url" value={postUrl} maxLength={2000} placeholder="https://" onChange={(event) => setPostUrl(event.target.value)} />
        </label>
      </div>
      <div className="copy-row">
        <button className="button" type="button" disabled={busy} onClick={() => void save()}>Save</button>
        <PlatformCopyButtons post={{ title, caption, hashtags }} onCopy={(label, value) => void copy(label, value)} />
      </div>
      <div className="copy-row">
        <button className="button secondary" type="button" disabled={busy} onClick={() => void save("ready")}>Mark ready</button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => void save("published")}>Mark published</button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => void save("skipped")}>Skip</button>
      </div>
      {copied ? <p role="status">{copied}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
