import type { VideoGenerationProvider } from "./provider";

const HIGGSFIELD_API_URL = "https://api.higgsfield.ai";

export function higgsfieldProvider(): VideoGenerationProvider {
  const keyId = process.env.HF_API_KEY_ID;
  const keySecret = process.env.HF_API_KEY_SECRET;
  const enabled = process.env.HIGGSFIELD_GENERATION_ENABLED === "true";
  const model = process.env.HIGGSFIELD_MODEL ?? "bytedance/seedance-2.0/text-to-video";
  return {
    name: "higgsfield",
    configured: enabled && Boolean(keyId && keySecret && model),
    async submit(request) {
      if (!enabled || !keyId || !keySecret || !model) throw new Error("HIGGSFIELD_NOT_CONFIGURED");
      const response = await fetch(`${HIGGSFIELD_API_URL}/${model}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${keyId}:${keySecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `${request.title}\n\nHook: ${request.hook}\n\n${request.scriptBody}\n\nScene cues: ${request.sceneCues}\n\nCaptions: ${request.captionText}`.slice(0, 12000),
          resolution: "720p",
          generate_audio: true,
          duration: 5,
          aspect_ratio: "9:16",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("HIGGSFIELD_API_ERROR");
      const payload = (await response.json()) as { request_id?: unknown };
      if (typeof payload.request_id !== "string" || payload.request_id.length < 1 || payload.request_id.length > 300) {
        throw new Error("HIGGSFIELD_INVALID_RESPONSE");
      }
      return { externalJobId: payload.request_id };
    },
  };
}
