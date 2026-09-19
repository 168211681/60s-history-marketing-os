import assert from "node:assert/strict";
import test from "node:test";
import { aiProvider } from "../src/lib/ai/provider";

test("AI provider is honestly unavailable without explicit configuration", async () => {
  const previous = { provider: process.env.AI_PROVIDER, key: process.env.AI_API_KEY, base: process.env.AI_BASE_URL, model: process.env.AI_MODEL };
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  try {
    const provider = aiProvider();
    assert.equal(provider.configured, false);
    await assert.rejects(() => provider.analyze({ channel: "x", period: { from: "2026-01-01", through: "2026-01-02" }, summary: {}, videos: [], calculatedInsights: [] }), /AI_NOT_CONFIGURED/);
  } finally {
    for (const [key, value] of Object.entries({ AI_PROVIDER: previous.provider, AI_API_KEY: previous.key, AI_BASE_URL: previous.base, AI_MODEL: previous.model })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("OpenAI-compatible adapter validates structured analysis output", async () => {
  const previous = { provider: process.env.AI_PROVIDER, key: process.env.AI_API_KEY, base: process.env.AI_BASE_URL, model: process.env.AI_MODEL };
  process.env.AI_PROVIDER = "openai-compatible";
  process.env.AI_API_KEY = "server-only-test-key";
  process.env.AI_BASE_URL = "https://ai.example.test/v1";
  process.env.AI_MODEL = "test-model";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://ai.example.test/v1/chat/completions");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer server-only-test-key");
    return Response.json({ choices: [{ message: { content: JSON.stringify({ observations: ["Observed"], hypotheses: ["Hypothesis"], experiments: ["Experiment"] }) } }] });
  };
  try {
    const provider = aiProvider();
    assert.equal(provider.configured, true);
    assert.deepEqual(await provider.analyze({ channel: "x", period: { from: "2026-01-01", through: "2026-01-02" }, summary: {}, videos: [], calculatedInsights: [] }), { observations: ["Observed"], hypotheses: ["Hypothesis"], experiments: ["Experiment"] });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ AI_PROVIDER: previous.provider, AI_API_KEY: previous.key, AI_BASE_URL: previous.base, AI_MODEL: previous.model })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
