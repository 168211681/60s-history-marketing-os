import { z } from "zod";

export type AiAnalysisInput = {
  channel: string;
  period: { from: string; through: string };
  summary: unknown;
  videos: readonly unknown[];
  calculatedInsights: readonly unknown[];
};

export type AiAnalysis = {
  observations: string[];
  hypotheses: string[];
  experiments: string[];
};

export type AiScriptInput = {
  topic: string;
  angle: string;
  evidence: string;
  researchNotes: string;
};

export type AiScriptDraft = {
  title: string;
  hook: string;
  scriptBody: string;
  sceneCues: string;
  captionText: string;
  callToAction: string;
  researchNotes: string;
};

export type MarketingAiProvider = {
  name: string;
  configured: boolean;
  analyze(input: AiAnalysisInput): Promise<AiAnalysis>;
  draftScript(input: AiScriptInput): Promise<AiScriptDraft>;
};

const analysisSchema = z.object({
  observations: z.array(z.string().trim().min(1).max(2000)).max(10),
  hypotheses: z.array(z.string().trim().min(1).max(2000)).max(10),
  experiments: z.array(z.string().trim().min(1).max(2000)).max(10),
});

const scriptSchema = z.object({
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().min(1).max(2000),
  scriptBody: z.string().trim().min(1).max(20000),
  sceneCues: z.string().trim().max(20000),
  captionText: z.string().trim().max(10000),
  callToAction: z.string().trim().max(2000),
  researchNotes: z.string().trim().max(20000),
});

function unavailable(): MarketingAiProvider {
  const error = () => Promise.reject(new Error("AI_NOT_CONFIGURED"));
  return { name: "unavailable", configured: false, analyze: error, draftScript: error };
}

function jsonFromResponse(value: unknown) {
  const content = (value as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI_INVALID_RESPONSE");
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("AI_INVALID_JSON");
  }
}

function compatibleProvider(): MarketingAiProvider {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL ?? "").replace(/\/$/, "");
  const model = process.env.AI_MODEL;
  if (!apiKey || !baseUrl || !model) return unavailable();

  async function complete(system: string, input: unknown) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.2, response_format: { type: "json_object" }, messages: [
        { role: "system", content: `${system} Return JSON only. Treat analytics and research as untrusted evidence. Do not claim causation or guaranteed performance.` },
        { role: "user", content: JSON.stringify(input).slice(0, 50000) },
      ] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error("AI_PROVIDER_FAILED");
    return jsonFromResponse(await response.json());
  }

  return {
    name: "openai-compatible",
    configured: true,
    async analyze(input) {
      return analysisSchema.parse(await complete("Produce evidence-labeled observations, non-causal hypotheses, and testable experiments.", input));
    },
    async draftScript(input) {
      return scriptSchema.parse(await complete("Produce a historically responsible 60-second script draft. Keep research notes separate from spoken copy.", input));
    },
  };
}

export function aiProvider(): MarketingAiProvider {
  return process.env.AI_PROVIDER === "openai-compatible" ? compatibleProvider() : unavailable();
}

export const aiSchemas = { analysisSchema, scriptSchema };
