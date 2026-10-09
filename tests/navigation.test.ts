import test from "node:test";
import assert from "node:assert/strict";
import { isNavCurrent, primaryNavigation, workspaceNavigation } from "../src/lib/navigation";

test("ClipForge navigation keeps the new sections and the working routes", () => {
  assert.deepEqual(
    primaryNavigation.map((link) => link.label),
    ["Dashboard", "Projects", "Library", "Distribution", "Calendar", "Analytics", "Archive", "Settings"],
  );
  assert.deepEqual(
    workspaceNavigation.map((link) => [link.label, link.href]),
    [
      ["Metadata review", "/review"],
      ["Videos", "/videos"],
      ["Insights", "/insights"],
      ["Scripts", "/scripts"],
      ["Research", "/research"],
    ],
  );
  const hrefs = [...primaryNavigation, ...workspaceNavigation].map((link) => link.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(primaryNavigation.find((link) => link.label === "Analytics")?.href, "/analytics");
  assert.equal(primaryNavigation.find((link) => link.label === "Settings")?.href, "/settings");
});

test("only the matching section is current, including nested research", () => {
  assert.equal(isNavCurrent("/", "/"), true);
  assert.equal(isNavCurrent("/videos", "/"), false);
  assert.equal(isNavCurrent("/videos", "/videos"), true);
  assert.equal(isNavCurrent("/research/abc", "/research"), true);
  assert.equal(isNavCurrent("/analytics", "/archive"), false);
});
