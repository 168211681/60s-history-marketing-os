import test from "node:test";
import assert from "node:assert/strict";
import { isCronAuthorized } from "../src/lib/cron-auth";

test("cron authorization requires the exact bearer secret", () => {
  assert.equal(isCronAuthorized("Bearer secret", "secret"), true);
  assert.equal(isCronAuthorized("bearer secret", "secret"), false);
  assert.equal(isCronAuthorized("Bearer other", "secret"), false);
  assert.equal(isCronAuthorized(null, "secret"), false);
  assert.equal(isCronAuthorized("Bearer secret", undefined), false);
});
