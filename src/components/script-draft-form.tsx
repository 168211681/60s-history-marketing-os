"use client";

import { useState } from "react";

export function ScriptDraftForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/scripts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    if (!response.ok) { setMessage(await response.text()); setBusy(false); return; }
    window.location.reload();
  }
  return <form className="stack-md" onSubmit={submit}>
    <p className="muted">สร้าง draft แรกด้วยตัวเองได้ทันที หรือใช้ MCP เพื่อให้ AI สร้างให้</p>
    <input className="input" name="title" placeholder="หัวข้อวิดีโอ" required maxLength={200} />
    <input className="input" name="hook" placeholder="Hook เปิดคลิป" required maxLength={2000} />
    <textarea className="input" name="scriptBody" placeholder="บทพูด 60 วินาที" required rows={6} maxLength={20000} />
    <button className="button" type="submit" disabled={busy}>{busy ? "กำลังบันทึก…" : "สร้าง script draft"}</button>
    {message ? <p className="error-text" role="alert">{message}</p> : null}
  </form>;
}
