"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AiScriptDraftForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/ai/script", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(body?.error === "AI_NOT_CONFIGURED"
          ? "AI provider ยังไม่ได้ตั้งค่า จึงยังสร้าง draft ไม่ได้"
          : "สร้าง draft ไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      event.currentTarget.reset();
      setMessage("สร้าง draft แล้ว — ตรวจทานและกด Mark reviewed ก่อนเริ่ม workflow");
      router.refresh();
    } catch {
      setMessage("เชื่อมต่อ AI provider ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-md" onSubmit={submit}>
      <p className="muted">สร้าง draft จาก AI provider ที่ตั้งค่าไว้ ผลลัพธ์จะถูกบันทึกเป็น draft และไม่ถูกเผยแพร่อัตโนมัติ</p>
      <input className="input" name="topic" placeholder="หัวข้อที่ต้องการค้นคว้า" required maxLength={2000} />
      <input className="input" name="angle" placeholder="มุมเล่าเรื่องหรือ hook ที่ต้องการ" maxLength={4000} />
      <textarea className="input" name="evidence" placeholder="ข้อมูลหรือหลักฐานที่ต้องใช้" rows={3} maxLength={10000} />
      <textarea className="input" name="researchNotes" placeholder="บันทึกการค้นคว้า (ไม่ใช่บทพูด)" rows={3} maxLength={10000} />
      <button className="button" type="submit" disabled={busy}>{busy ? "กำลังสร้าง…" : "Generate AI script draft"}</button>
      {message ? <p className="muted" role="status">{message}</p> : null}
    </form>
  );
}
