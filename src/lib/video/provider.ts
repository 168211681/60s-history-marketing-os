export type VideoGenerationRequest = {
  draftId: string;
  title: string;
  hook: string;
  scriptBody: string;
  sceneCues: string;
  captionText: string;
};

export type VideoProviderName = "higgsfield" | "huggingface" | "fal" | "replicate" | "runway";

export type VideoGenerationProvider = {
  name: VideoProviderName;
  configured: boolean;
  submit(request: VideoGenerationRequest): Promise<{ externalJobId: string }>;
  status(externalJobId: string): Promise<{ status: "queued" | "rendering" | "completed" | "failed"; artifactUrl?: string }>;
};

export function unsupportedVideoProvider(name: VideoProviderName): VideoGenerationProvider {
  return {
    name,
    configured: false,
    async submit() {
      throw new Error(`${name.toUpperCase()}_NOT_IMPLEMENTED`);
    },
    async status() {
      throw new Error(`${name.toUpperCase()}_NOT_IMPLEMENTED`);
    },
  };
}
