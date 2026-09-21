import assert from "node:assert/strict";
import test from "node:test";
import { pcmToWav, voiceProvider } from "../src/lib/video/voice";

test("Gemini voice provider converts PCM output to WAV", async () => {
  const previous = { key: process.env.GEMINI_API_KEY, provider: process.env.VOICE_PROVIDER };
  const originalFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "server-only-test-key";
  delete process.env.VOICE_PROVIDER;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /generativelanguage\.googleapis\.com/);
    assert.equal((init?.headers as Record<string, string>)["content-type"], "application/json");
    return Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from([0, 1, 2, 3]).toString("base64"), mimeType: "audio/L16;rate=16000" } }] } }] });
  };
  try {
    const provider = voiceProvider();
    assert.equal(provider.name, "gemini");
    const output = await provider.synthesize("Test narration");
    assert.equal(output.contentType, "audio/wav");
    assert.equal(new TextDecoder().decode(output.bytes.slice(0, 4)), "RIFF");
    assert.equal(new DataView(output.bytes.buffer).getUint32(24, true), 16000);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous.key;
    if (previous.provider === undefined) delete process.env.VOICE_PROVIDER; else process.env.VOICE_PROVIDER = previous.provider;
  }
});

test("PCM WAV helper writes a valid mono header", () => {
  const wav = pcmToWav(new Uint8Array([1, 2]), 24000);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(new DataView(wav.buffer).getUint32(24, true), 24000);
  assert.equal(wav.byteLength, 46);
});
