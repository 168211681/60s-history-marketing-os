import { InferenceClient } from "@huggingface/inference";

export type VoiceProvider = {
  name: "gemini" | "huggingface";
  configured: boolean;
  synthesize(text: string): Promise<{ bytes: Uint8Array; contentType: string }>;
};

export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1, bitsPerSample = 16) {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true); view.setUint16(34, bitsPerSample, true);
  write(36, "data"); view.setUint32(40, pcm.byteLength, true); new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}

function geminiVoiceProvider(): VoiceProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
  const voice = process.env.GEMINI_TTS_VOICE ?? "Kore";
  return {
    name: "gemini", configured: Boolean(apiKey && model && voice),
    async synthesize(text) {
      if (!apiKey || !model || !voice) throw new Error("VOICE_NOT_CONFIGURED");
      const value = text.trim().slice(0, 12000);
      if (!value) throw new Error("VOICE_TEXT_REQUIRED");
      const timeoutMs = Math.max(5_000, Math.min(25_000, Number(process.env.GEMINI_TTS_TIMEOUT_MS ?? 20_000)));
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: value }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`GEMINI_TTS_HTTP_${response.status}`);
      const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> };
      const inlineData = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
      if (!inlineData?.data) throw new Error("GEMINI_TTS_EMPTY_OUTPUT");
      const sampleRate = Number(inlineData.mimeType?.match(/rate=(\d+)/i)?.[1] ?? 24000);
      return { bytes: pcmToWav(new Uint8Array(Buffer.from(inlineData.data, "base64")), sampleRate), contentType: "audio/wav" };
    },
  };
}

function huggingFaceVoiceProvider(): VoiceProvider {
  const token = process.env.HF_TOKEN;
  const model = process.env.HF_TTS_MODEL ?? "facebook/mms-tts-eng";
  return {
    name: "huggingface", configured: Boolean(token && model),
    async synthesize(text) {
      if (!token || !model) throw new Error("VOICE_NOT_CONFIGURED");
      const value = text.trim().slice(0, 12000);
      if (!value) throw new Error("VOICE_TEXT_REQUIRED");
      const audio = await new InferenceClient(token).textToSpeech({ model, inputs: value }, { signal: AbortSignal.timeout(57_000) });
      return { bytes: new Uint8Array(await audio.arrayBuffer()), contentType: audio.type || "audio/wav" };
    },
  };
}

export function voiceProvider(): VoiceProvider {
  const requested = process.env.VOICE_PROVIDER;
  if (requested === "huggingface") return huggingFaceVoiceProvider();
  if (requested === "gemini" || process.env.GEMINI_API_KEY) return geminiVoiceProvider();
  return huggingFaceVoiceProvider();
}
