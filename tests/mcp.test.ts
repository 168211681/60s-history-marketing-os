import assert from "node:assert/strict";
import test from "node:test";
import { isMcpAuthorized } from "../src/lib/ai/mcp-auth";
import { canAdvanceScriptStatus } from "../src/lib/data/script-status";
import { higgsfieldProvider } from "../src/lib/video/higgsfield";

test("MCP authorization requires the configured bearer secret", () => {
  assert.equal(isMcpAuthorized("Bearer test-secret", "test-secret"), true);
  assert.equal(isMcpAuthorized("Bearer wrong", "test-secret"), false);
  assert.equal(isMcpAuthorized(null, "test-secret"), false);
  assert.equal(isMcpAuthorized("Bearer test-secret", undefined), false);
});

test("script approval follows the human review sequence", () => {
  assert.equal(canAdvanceScriptStatus("draft", "reviewed"), true);
  assert.equal(canAdvanceScriptStatus("reviewed", "approved"), true);
  assert.equal(canAdvanceScriptStatus("draft", "approved"), false);
  assert.equal(canAdvanceScriptStatus("approved", "reviewed"), false);
});

test("Higgsfield remains unavailable without server credentials", async () => {
  const originalId = process.env.HF_API_KEY_ID;
  const originalSecret = process.env.HF_API_KEY_SECRET;
  const originalEnabled = process.env.HIGGSFIELD_GENERATION_ENABLED;
  delete process.env.HF_API_KEY_ID;
  delete process.env.HF_API_KEY_SECRET;
  delete process.env.HIGGSFIELD_GENERATION_ENABLED;
  const provider = higgsfieldProvider();
  assert.equal(provider.configured, false);
  await assert.rejects(() => provider.submit({ draftId: "draft", title: "title", hook: "hook", scriptBody: "body", sceneCues: "", captionText: "" }), /HIGGSFIELD_NOT_CONFIGURED/);
  if (originalId === undefined) delete process.env.HF_API_KEY_ID; else process.env.HF_API_KEY_ID = originalId;
  if (originalSecret === undefined) delete process.env.HF_API_KEY_SECRET; else process.env.HF_API_KEY_SECRET = originalSecret;
  if (originalEnabled === undefined) delete process.env.HIGGSFIELD_GENERATION_ENABLED; else process.env.HIGGSFIELD_GENERATION_ENABLED = originalEnabled;
});
