"use client";

import { useState } from "react";

export function MarketChannelForm() {
  const [channelId, setChannelId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const response = await fetch("/api/market/channels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ youtubeChannelId: channelId }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(`เพิ่มช่องไม่สำเร็จ: ${payload.error ?? "MARKET_SYNC_FAILED"}`); return; }
    setChannelId(""); setMessage(`ซิงก์ ${payload.channel.title} แล้ว ${payload.channel.syncedVideos} วิดีโอ`); window.location.reload();
  }
  return <form className="settings-actions" onSubmit={submit}>
    <label htmlFor="market-channel-id">YouTube Channel ID</label>
    <input id="market-channel-id" className="text-input" value={channelId} onChange={(event) => setChannelId(event.target.value)} placeholder="UC..." pattern="[A-Za-z0-9_-]{1,128}" required />
    <button className="button" type="submit" disabled={busy}>{busy ? "กำลังซิงก์…" : "เพิ่มและซิงก์ช่อง"}</button>
    {message ? <p className="muted" role="status">{message}</p> : null}
  </form>;
}
