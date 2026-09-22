import assert from "node:assert/strict";
import test from "node:test";
import { buildBriefPackage, exportAccessDecision, MAX_EXPORT_BYTES, zipBriefPackage } from "../src/lib/creative-brief-export";

const draft = {
  title: "อยุธยาเคยเป็นมหานครระดับโลก",
  hook: "อยุธยาไม่ใช่แค่เมืองวัด",
  scriptBody: "เมืองนี้เชื่อมโลกการค้าเข้าด้วยกัน",
  sceneCues: "ซากวัด\nแผนที่แม่น้ำสามสาย\nตลาดนานาชาติ",
  captionText: "อยุธยาเคยเชื่อมโลก",
  callToAction: "กดติดตามเพื่อดูเรื่องต่อไป",
  researchNotes: "ตรวจสอบกับแหล่งข้อมูลประวัติศาสตร์ก่อนเผยแพร่",
  status: "approved" as const,
  createdAt: "2026-09-22T00:00:00.000Z",
};

test("brief export creates exactly six honest production-package files", () => {
  const files = buildBriefPackage(draft);
  assert.deepEqual(files.map((file) => file.name), ["content-brief.md", "script.md", "storyboard.md", "voiceover.txt", "captions.txt", "metadata.json"]);
  assert.match(files.find((file) => file.name === "metadata.json")!.content, /"captionTiming": "not_provided"/);
  assert.doesNotMatch(files.find((file) => file.name === "captions.txt")!.content, /00:00:00/);
});

function extractStoredZip(zip: Buffer) {
  const files = new Map<string, string>();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = zip.readUInt16LE(offset + 26);
    const dataLength = zip.readUInt32LE(offset + 22);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const data = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + dataLength);
    files.set(name, data.toString("utf8"));
    offset += 30 + nameLength + dataLength;
  }
  return files;
}

test("brief export ZIP extracts all six files with expected content", () => {
  const zip = zipBriefPackage(buildBriefPackage(draft));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 6);
  const files = extractStoredZip(zip);
  assert.deepEqual([...files.keys()], ["content-brief.md", "script.md", "storyboard.md", "voiceover.txt", "captions.txt", "metadata.json"]);
  assert.match(files.get("script.md")!, /เมืองนี้เชื่อมโลก/);
  assert.match(files.get("storyboard.md")!, /Scene 3/);
  assert.match(files.get("voiceover.txt")!, /กดติดตาม/);
  assert.equal(JSON.parse(files.get("metadata.json")!).captionTiming, "not_provided");
  assert.doesNotMatch(files.get("captions.txt")!, /\d\d:\d\d:\d\d/);
});

test("export access rejects unauthenticated, foreign-owner and unapproved drafts", () => {
  assert.deepEqual(exportAccessDecision({ authenticated: false, ownerMatch: false }), { status: 401, error: "Unauthorized" });
  assert.deepEqual(exportAccessDecision({ authenticated: true, ownerMatch: false, draftStatus: "approved" }), { status: 404, error: "Draft not found" });
  assert.deepEqual(exportAccessDecision({ authenticated: true, ownerMatch: true, draftStatus: "reviewed" }), { status: 409, error: "Draft must be approved before export" });
});

test("export redacts secret-like text, uses safe fixed filenames and rejects oversized payloads", () => {
  const files = buildBriefPackage({ ...draft, researchNotes: "DATABASE_URL=postgresql://secret.example/db Bearer abc123" });
  assert.equal(files.every((file) => /^[a-z0-9.-]+$/.test(file.name)), true);
  assert.doesNotMatch(files.map((file) => file.content).join("\n"), /postgresql:\/\/secret|Bearer abc123|DATABASE_URL=/);
  assert.throws(() => zipBriefPackage([{ name: "content-brief.md", content: "x".repeat(MAX_EXPORT_BYTES) }]), /too large/);
});

test("missing evidence stays explicitly unverified", () => {
  const files = buildBriefPackage({ ...draft, researchNotes: "" });
  assert.match(files.find((file) => file.name === "content-brief.md")!.content, /No research notes were supplied/);
  assert.equal(JSON.parse(files.find((file) => file.name === "metadata.json")!.content).factCheckStatus, "insufficient_evidence");
});
