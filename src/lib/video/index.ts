import { higgsfieldProvider } from "./higgsfield";
import { unsupportedVideoProvider, type VideoGenerationProvider, type VideoProviderName } from "./provider";

const supportedProviderNames: VideoProviderName[] = ["higgsfield", "huggingface", "fal", "replicate", "runway"];

export function videoProvider(): VideoGenerationProvider {
  const configuredName = process.env.VIDEO_PROVIDER?.toLowerCase() ?? "higgsfield";
  const name = supportedProviderNames.includes(configuredName as VideoProviderName)
    ? configuredName as VideoProviderName
    : "higgsfield";

  if (name === "higgsfield") return higgsfieldProvider();
  return unsupportedVideoProvider(name);
}
