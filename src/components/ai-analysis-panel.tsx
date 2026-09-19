"use client";

import { useState } from "react";
import { Panel } from "@/components/ui";
import type { AiAnalysis } from "@/lib/ai/provider";

const sections: Array<[keyof AiAnalysis, string]> = [
  ["observations", "OBSERVED DATA"],
  ["hypotheses", "HYPOTHESES · NOT CAUSAL"],
  ["experiments", "SUGGESTED EXPERIMENTS"],
];

export function AiAnalysisPanel() {
  const [result, setResult] = useState<AiAnalysis | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await response.json().catch(() => null) as { error?: string; result?: AiAnalysis } | null;
      if (!response.ok) {
        setResult(null);
        setMessage(body?.error === "AI_NOT_CONFIGURED"
          ? "AI provider ยังไม่ได้ตั้งค่า จึงยังสร้างรายงานไม่ได้"
          : "สร้างรายงานไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      setResult(body?.result ?? null);
      if (!body?.result) setMessage("ผู้ให้บริการส่งข้อมูลไม่ครบ");
    } catch {
      setMessage("เชื่อมต่อ AI provider ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="AI marketing analysis"
      description="สร้างจาก analytics ของช่องที่ซิงก์ไว้ และต้องตรวจทานก่อนนำไปใช้"
      action={<span className={`badge ${result ? "success" : "neutral"}`}>{result ? "Generated" : "Optional"}</span>}
    >
      <div className="stack-md">
        <p className="muted">AI จะได้รับเฉพาะข้อมูลใน reporting window ปัจจุบัน ผลลัพธ์เป็นข้อเสนอแนะ ไม่ใช่ข้อพิสูจน์เหตุผลหรือการรับประกันยอดวิว</p>
        <button className="button" type="button" onClick={generate} disabled={busy}>
          {busy ? "กำลังวิเคราะห์…" : "Generate AI analysis"}
        </button>
        {message ? <p className="error-text" role="status">{message}</p> : null}
        {result ? (
          <div className="insight-steps">
            {sections.map(([key, label]) => (
              <div key={key}>
                <p className="eyebrow">{label}</p>
                <ul>
                  {result[key].map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
