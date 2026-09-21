import { higgsfieldProvider } from "./higgsfield";
import { huggingfaceProvider } from "./huggingface";
import { publicDomainProvider } from "./public-domain";
import { unsupportedVideoProvider, type VideoGenerationProvider, type VideoProviderName } from "./provider";

const supportedProviderNames: VideoProviderName[] = ["higgsfield", "huggingface", "public-domain", "fal", "replicate", "runway"];

export function videoProvider(): VideoGenerationProvider {
  const configuredName = process.env.VIDEO_PROVIDER?.toLowerCase() ?? "higgsfield";
  const name = supportedProviderNames.includes(configuredName as VideoProviderName)
    ? configuredName as VideoProviderName
    : "higgsfield";

  if (name === "higgsfield") return higgsfieldProvider();
  if (name === "huggingface") return huggingfaceProvider();
  if (name === "public-domain") return publicDomainProvider();
  return unsupportedVideoProvider(name);
}
