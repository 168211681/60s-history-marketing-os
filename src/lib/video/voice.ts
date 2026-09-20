import { InferenceClient } from "@huggingface/inference";

export type VoiceProvider = {
  name: "huggingface";
  configured: boolean;
  synthesize(text: string): Promise<{ bytes: Uint8Array; contentType: string }>;
};

export function voiceProvider(): VoiceProvider {
  const token = process.env.HF_TOKEN;
  const model = process.env.HF_TTS_MODEL ?? "facebook/mms-tts-eng";
  return {
    name: "huggingface",
    configured: Boolean(token && model),
    async synthesize(text) {
      if (!token || !model) throw new Error("VOICE_NOT_CONFIGURED");
      const value = text.trim().slice(0, 12000);
      if (!value) throw new Error("VOICE_TEXT_REQUIRED");
      const audio = await new InferenceClient(token).textToSpeech({ model, inputs: value }, { signal: AbortSignal.timeout(57_000) });
      return { bytes: new Uint8Array(await audio.arrayBuffer()), contentType: audio.type || "audio/wav" };
    },
  };
}
