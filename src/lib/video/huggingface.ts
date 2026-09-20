import { InferenceClient } from "@huggingface/inference";
import { storeVideoArtifact } from "./artifacts";
import type { VideoGenerationProvider } from "./provider";

export function huggingfaceProvider(): VideoGenerationProvider {
  const token = process.env.HF_TOKEN;
  const model = process.env.HF_VIDEO_MODEL ?? "Wan-AI/Wan2.1-T2V-1.3B";
  const providerName = process.env.HF_VIDEO_PROVIDER ?? "fal-ai";
  const provider = providerName === "replicate" ? "replicate" : providerName === "fal-ai" ? "fal-ai" : undefined;
  const storageReady = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    name: "huggingface",
    configured: Boolean(token && model && provider && storageReady),
    async submit(request) {
      if (!token || !model || !provider) throw new Error("HUGGINGFACE_NOT_CONFIGURED");
      const client = new InferenceClient(token);
      const prompt = `${request.title}\n\nHook: ${request.hook}\n\n${request.scriptBody}\n\nScene cues: ${request.sceneCues}`.slice(0, 12000);
      const video = await client.textToVideo({ model, provider, inputs: prompt }, { signal: AbortSignal.timeout(57_000) });
      const bytes = new Uint8Array(await video.arrayBuffer());
      const stored = await storeVideoArtifact(bytes, video.type || "video/mp4");
      return { externalJobId: stored.path, artifactUrl: stored.artifactUrl };
    },
    async status() {
      throw new Error("HUGGINGFACE_STATUS_UNSUPPORTED");
    },
  };
}
