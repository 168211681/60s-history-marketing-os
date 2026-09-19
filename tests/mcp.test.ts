import assert from "node:assert/strict";
import test from "node:test";
import { isMcpAuthorized } from "../src/lib/ai/mcp-auth";
import { canAdvanceScriptStatus } from "../src/lib/data/script-status";

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
