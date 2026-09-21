"use client";

import { useState } from "react";

export function PromptFactory() {
  const [mode, setMode] = useState<"content" | "channel_summary">("channel_summary");
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus(null);
    const response = await fetch("/api/prompts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, topic, language: "th" }) });
    const payload = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setStatus(`สร้าง prompt ไม่สำเร็จ: ${payload.error ?? "PROMPT_GENERATION_FAILED"}`); return; }
    setPrompt(payload.prompt ?? ""); setStatus("สร้าง prompt แล้ว ตรวจสอบก่อนนำไปวางใน GPT Plus");
  }
  async function copy() { await navigator.clipboard.writeText(prompt); setStatus("คัดลอก prompt แล้ว"); }
  return <>
    <form className="settings-actions" onSubmit={generate}>
      <label htmlFor="prompt-mode">ประเภท prompt</label>
      <select id="prompt-mode" className="text-input" value={mode} onChange={(event) => setMode(event.target.value as "content" | "channel_summary")}>
        <option value="channel_summary">สรุปข้อมูลช่องเท่านั้น</option>
        <option value="content">วางแผนคอนเทนต์จาก analytics</option>
      </select>
      {mode === "content" ? <>
        <label htmlFor="prompt-topic">หัวข้อหรือ opportunity ที่ต้องการให้ GPT ทำต่อ</label>
        <input id="prompt-topic" className="text-input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="เช่น ancient inventions that changed warfare" required />
      </> : <p className="muted text-sm">สร้างรายงานภาพรวมช่องจากข้อมูล analytics ที่บันทึกไว้ โดยไม่สร้างสคริปต์หรือไอเดียวิดีโอ</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? "กำลังสร้าง prompt…" : mode === "channel_summary" ? "สร้างสรุปข้อมูลช่อง" : "สร้าง prompt จาก analytics"}</button>
    </form>
    {status ? <p className="muted" role="status">{status}</p> : null}
    {prompt ? <div className="prompt-output"><textarea aria-label="Generated prompt" value={prompt} readOnly /><button className="button secondary" type="button" onClick={copy}>Copy prompt</button></div> : null}
  </>;
}
