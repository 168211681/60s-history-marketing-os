import test from "node:test";
import assert from "node:assert/strict";
import { escapeLike, parseContentInput, parseContentPatch, parseProjectInput, parseProjectPatch } from "../src/lib/clipforge/model";

test("project input accepts owner-entered names and normalizes codes", () => {
  assert.deepEqual(parseProjectInput({ name: " History in 60s ", code: "h60", description: "Short", status: "active" }), {
    name: "History in 60s",
    code: "H60",
    description: "Short",
    status: "active",
  });
  assert.equal(parseProjectInput({ name: "Affiliate", code: "", status: "nope" }), null);
  assert.equal(parseProjectInput({ name: "", code: "AFF" }), null);
  assert.deepEqual(parseProjectPatch({ status: "archived" }), { status: "archived" });
  assert.equal(parseProjectPatch({}), null);
});

test("content input rejects unknown status and blank keys", () => {
  const projectId = "a1000000-0000-4000-8000-000000000001";
  assert.equal(parseContentInput({ projectId, title: "Siege", contentKey: "h60-0042", durationSeconds: "58" })?.contentKey, "H60-0042");
  const created = parseContentInput({ projectId, title: "Siege" });
  assert.equal(created?.format, "unknown");
  assert.equal(created?.productionType, "unknown");
  assert.equal(created?.status, "idea");
  assert.equal(created?.contentKey, null);
  assert.equal(created?.durationSeconds, null);
  assert.equal(created?.languageCode, "en");
  assert.equal(parseContentInput({ projectId, title: "Siege", format: "nope" }), null);
  assert.equal(parseContentInput({ projectId, title: "Siege", status: "viral" }), null);
  assert.equal(parseContentInput({ projectId: "not-a-uuid", title: "Siege" }), null);
  assert.deepEqual(parseContentPatch({ status: "archived" }), { status: "archived" });
  assert.equal(parseContentPatch({ durationSeconds: 90000 }), null);
  assert.equal(escapeLike("100%_done"), "%100\\%\\_done%");
});
