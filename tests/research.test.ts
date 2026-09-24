import assert from "node:assert/strict";
import test from "node:test";
import { buildBriefPackage, zipBriefPackage } from "../src/lib/creative-brief-export";
import { canApproveResearch, evidenceStatus, factCheckedContext, type ResearchProject } from "../src/lib/research/model";

const source = { id: "source-1", sourceType: "museum_archive", title: "Archive record", publisher: "Museum",
  author: null, publishedAt: null, url: null, citationText: "Archive catalogue entry", notes: "", reliabilityNote: "Dating is approximate" };
const claim = { id: "claim-1", claimText: "The city was founded circa 1350", verdict: "supported" as const,
  confidence: "medium" as const, reviewerNote: "Date is approximate", sources: [{ sourceId: source.id, relationship: "supports" as const }] };
const project: ResearchProject = { id: "project-1", channelId: "channel-1", contentIdeaId: null,
  experimentId: null, scriptDraftId: null, topic: "Ayutthaya", status: "review", researchQuestion: "When was it founded?",
  summary: "Date is approximate", confidenceNote: "Chronology is uncertain", sources: [source], claims: [claim] };

test("research approval requires human review, supporting evidence and notes", () => {
  assert.equal(canApproveResearch(project), true);
  assert.equal(canApproveResearch({ ...project, status: "draft" }), false);
  assert.equal(canApproveResearch({ ...project, sources: [] }), false);
  assert.equal(canApproveResearch({ ...project, claims: [{ ...claim, sources: [] }] }), false);
  assert.equal(canApproveResearch({ ...project, claims: [{ ...claim, verdict: "insufficient" }] }), false);
});

test("unapproved, disputed and insufficient claims never become supported facts", () => {
  assert.equal(evidenceStatus(null), "not_researched");
  assert.equal(evidenceStatus(project), "research_in_progress");
  assert.deepEqual(factCheckedContext(project).supportedClaims, []);
  const approved = { ...project, status: "approved" as const };
  assert.equal(evidenceStatus(approved), "reviewed");
  assert.deepEqual(factCheckedContext(approved).facts, []);
  assert.equal(factCheckedContext(approved).supportedClaims.length, 1);
  const disputed = { ...approved, claims: [{ ...claim, verdict: "disputed" as const }] };
  assert.equal(evidenceStatus(disputed), "insufficient_evidence");
  assert.equal(factCheckedContext(disputed).supportedClaims.length, 0);
  assert.equal(factCheckedContext(disputed).disputedClaims.length, 1);
  const insufficient = { ...approved, claims: [{ ...claim, verdict: "insufficient" as const, sources: [] }] };
  assert.equal(factCheckedContext(insufficient).insufficientClaims.length, 1);
});

test("legacy drafts and reviewed research keep the exact six-file ZIP contract", () => {
  const draft = { title: "Ayutthaya", hook: "A question", scriptBody: "A careful script", sceneCues: "Archive",
    captionText: "A careful script", callToAction: "Follow", researchNotes: "", status: "approved" as const,
    createdAt: "2026-09-24T00:00:00.000Z" };
  for (const researchProject of [undefined, { ...project, status: "approved" as const }]) {
    const files = buildBriefPackage({ ...draft, researchProject });
    assert.deepEqual(files.map((file) => file.name), ["content-brief.md", "script.md", "storyboard.md", "voiceover.txt", "captions.txt", "metadata.json"]);
    const metadata = JSON.parse(files[5].content);
    assert.equal(metadata.researchProjectId, researchProject?.id ?? null);
    assert.equal(metadata.captionTiming, "not_provided");
    assert.equal(metadata.sourceReferences.length, researchProject ? 1 : 0);
    assert.equal(zipBriefPackage(files).readUInt32LE(0), 0x04034b50);
    assert.match(files[0].content, /Known uncertainties/);
  }
});
