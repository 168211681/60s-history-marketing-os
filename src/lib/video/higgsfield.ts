import type { VideoGenerationProvider } from "./provider";

export function higgsfieldProvider(): VideoGenerationProvider {
  const keyId = process.env.HF_API_KEY_ID;
  const keySecret = process.env.HF_API_KEY_SECRET;
  const enabled = process.env.HIGGSFIELD_GENERATION_ENABLED === "true";
  const model = process.env.HIGGSFIELD_MODEL ?? "bytedance/seedance-2.0/text-to-video";
  return {
    name: "higgsfield",
    configured: enabled && Boolean(keyId && keySecret && model),
    async submit() {
      if (!enabled || !keyId || !keySecret || !model) throw new Error("HIGGSFIELD_NOT_CONFIGURED");
      throw new Error("HIGGSFIELD_ADAPTER_PENDING");
    },
  };
}
