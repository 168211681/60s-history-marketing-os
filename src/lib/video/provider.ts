export type VideoGenerationRequest = {
  draftId: string;
  title: string;
  hook: string;
  scriptBody: string;
  sceneCues: string;
  captionText: string;
};

export type VideoGenerationProvider = {
  name: "higgsfield";
  configured: boolean;
  submit(request: VideoGenerationRequest): Promise<{ externalJobId: string }>;
};
