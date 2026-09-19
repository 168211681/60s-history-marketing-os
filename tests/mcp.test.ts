import assert from "node:assert/strict";
import test from "node:test";
import { isMcpAuthorized } from "../src/lib/ai/mcp-auth";

test("MCP authorization requires the configured bearer secret", () => {
  assert.equal(isMcpAuthorized("Bearer test-secret", "test-secret"), true);
  assert.equal(isMcpAuthorized("Bearer wrong", "test-secret"), false);
  assert.equal(isMcpAuthorized(null, "test-secret"), false);
  assert.equal(isMcpAuthorized("Bearer test-secret", undefined), false);
});
