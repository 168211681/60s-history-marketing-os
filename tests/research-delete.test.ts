import assert from "node:assert/strict";
import test from "node:test";
import { deleteResearchProjectSql, researchProjectDeleteResult } from "../src/lib/research/delete-query.mjs";

test("research deletion query is owner-scoped and only targets its project", () => {
  assert.match(deleteResearchProjectSql, /delete from public\.research_projects/);
  assert.match(deleteResearchProjectSql, /c\.owner_id\s*=\s*\$2/);
  assert.match(deleteResearchProjectSql, /r\.id\s*=\s*\$1/);
  assert.doesNotMatch(deleteResearchProjectSql, /delete from public\.(channels|content_ideas|content_experiments|script_drafts)/);
});

test("research deletion maps an owned row to success and foreign or absent rows to 404", () => {
  assert.deepEqual(researchProjectDeleteResult([{ id: "owned-project" }]), {
    status: 200,
    body: { deleted: true, id: "owned-project" },
  });
  assert.deepEqual(researchProjectDeleteResult([]), {
    status: 404,
    body: { error: "Project not found" },
  });
});
