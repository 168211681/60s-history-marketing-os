import type { VideoGenerationProvider } from "./provider";

export function higgsfieldProvider(): VideoGenerationProvider {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  const apiUrl = process.env.HIGGSFIELD_API_URL;
  return {
    name: "higgsfield",
    configured: Boolean(apiKey && apiUrl),
    async submit() {
      if (!apiKey || !apiUrl) throw new Error("HIGGSFIELD_NOT_CONFIGURED");
      throw new Error("HIGGSFIELD_ADAPTER_PENDING");
    },
  };
}
