import { Buffer } from "node:buffer";

export type ExportDraft = {
  title: string;
  hook: string;
  scriptBody: string;
  sceneCues: string;
  captionText: string;
  callToAction: string;
  researchNotes: string;
  status: "draft" | "reviewed" | "approved" | "archived";
  createdAt: string;
};

export type BriefPackageFile = { name: string; content: string };
export const MAX_EXPORT_BYTES = 2_000_000;

export type ExportAccessInput = {
  authenticated: boolean;
  ownerMatch: boolean;
  draftStatus?: ExportDraft["status"];
};

export function exportAccessDecision(input: ExportAccessInput) {
  if (!input.authenticated) return { status: 401 as const, error: "Unauthorized" };
  if (!input.ownerMatch) return { status: 404 as const, error: "Draft not found" };
  if (input.draftStatus !== "approved") return { status: 409 as const, error: "Draft must be approved before export" };
  return { status: 200 as const, error: null };
}

function clean(value: string) {
  return value.trim().replace(/(?:postgres(?:ql)?:\/\/|(?:DATABASE_URL|SUPABASE_[A-Z_]*KEY|GOOGLE_CLIENT_SECRET)\s*[=:]|Bearer\s+)[^\s\n]+/gi, "[REDACTED]");
}

export function buildBriefPackage(draft: ExportDraft): BriefPackageFile[] {
  const title = clean(draft.title);
  const script = clean(draft.scriptBody);
  const hook = clean(draft.hook);
  const cta = clean(draft.callToAction);
  const research = clean(draft.researchNotes);
  const cues = clean(draft.sceneCues);
  const captions = clean(draft.captionText);
  const storyboardLines = cues
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  const storyboard = storyboardLines.length
    ? storyboardLines.map((line, index) => `## Scene ${index + 1}\n${line}\n\nVisual guidance: Use historically appropriate imagery and verify licensing before production.`).join("\n\n")
    : "## Scene 1\nOpening visual that establishes the subject.\n\n## Scene 2\nContext visual supporting the first claim.\n\n## Scene 3\nEvidence or location visual supporting the main explanation.\n\n## Scene 4\nConsequence or turning-point visual.\n\n## Scene 5\nClosing visual that reinforces the takeaway.\n\nVisual guidance: Do not invent timestamps; choose timing during external editing.";

  return [
    {
      name: "content-brief.md",
      content: `# Content Brief\n\n## Working title\n${title}\n\n## Target audience\nViewers interested in concise, evidence-backed history stories.\n\n## Hook\n${hook}\n\n## Evidence and limitations\n${research || "No research notes were supplied. Claims require fact-checking before publication."}\n\n## Hypotheses\nThe hook and visual structure are creative hypotheses, not causal conclusions. Compare performance against a similar experiment after publication.\n\n## Production boundary\nThis package is for external editing tools. It does not contain a rendered video, upload action, or publication instruction.\n`,
    },
    {
      name: "script.md",
      content: `# Script\n\n## Hook\n${hook}\n\n## Narration\n${script}\n\n## CTA\n${cta || "Invite viewers to follow for the next history story."}\n`,
    },
    {
      name: "storyboard.md",
      content: `# Storyboard\n\n${storyboard}\n\n## Editing notes\n- Keep on-screen text readable on a mobile vertical frame.\n- Confirm image, map, music and footage licenses.\n- Add timing only after the external edit has a measured voice track.\n`,
    },
    { name: "voiceover.txt", content: `${script}\n\n${cta}`.trim() + "\n" },
    { name: "captions.txt", content: `${captions || script}\n` },
    {
      name: "metadata.json",
      content: JSON.stringify({
        workingTitle: title,
        suggestedTitle: title,
        description: `${hook}\n\n${cta}`.trim(),
        language: "th",
        keywords: ["history", "60s History", "สารคดีสั้น"],
        factCheckStatus: research ? "needs_human_review" : "insufficient_evidence",
        evidenceLimitations: research ? research : "No research notes supplied.",
        draftStatus: draft.status,
        createdAt: draft.createdAt,
        captionTiming: "not_provided",
        exportVersion: 1,
      }, null, 2) + "\n",
    },
  ];
}

// Minimal ZIP writer using store entries. No video or binary artifact is generated.
function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipBriefPackage(files: BriefPackageFile[]) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content, "utf8");
    if (offset + 30 + name.length + data.length > MAX_EXPORT_BYTES) throw new RangeError("Export package is too large");
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    local.push(header, data);
    const entry = Buffer.alloc(46 + name.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(crc32(data), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    name.copy(entry, 46);
    central.push(entry);
    offset += header.length + data.length;
  }
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralData, end]);
}
