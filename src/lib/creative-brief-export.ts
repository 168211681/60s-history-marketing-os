import { Buffer } from "node:buffer";
import { evidenceStatus, factCheckedContext, type ResearchProject } from "./research/model";

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
  researchProject?: ResearchProject | null;
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
  return value.trim()
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/(?:DATABASE_URL|SUPABASE_[A-Z_]*KEY|GOOGLE_CLIENT_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|HF_TOKEN|HUGGINGFACE_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|TOKEN_ENCRYPTION_KEY|MCP_SECRET|CRON_SECRET)\s*[=:]\s*[^\s\n]+/gi, "[REDACTED CREDENTIAL]")
    .replace(/(?:postgres(?:ql)?:\/\/|Bearer\s+)[^\s\n]+/gi, "[REDACTED CREDENTIAL]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/g, "[REDACTED TOKEN]");
}

export function buildBriefPackage(draft: ExportDraft): BriefPackageFile[] {
  const title = clean(draft.title);
  const script = clean(draft.scriptBody);
  const hook = clean(draft.hook);
  const cta = clean(draft.callToAction);
  const research = clean(draft.researchNotes);
  const context = factCheckedContext(draft.researchProject ?? null);
  const references = context.sources.map((source) => `- ${clean(source.citationText)}${source.url ? ` — ${clean(source.url)}` : ""}`).join("\n");
  const uncertainties = context.uncertainties.map((note) => `- ${clean(note)}`).join("\n");
  const supported = context.supportedClaims.map((claim) => `- ${clean(claim.claimText)}`).join("\n");
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
      content: `# Content Brief\n\n## Working title\n${title}\n\n## Target audience\nViewers interested in concise, evidence-backed history stories.\n\n## Hook\n${hook}\n\n## Evidence status\n${evidenceStatus(draft.researchProject ?? null)}\n\n## Research references\n${references || "No linked research sources."}\n\n## Known uncertainties\n${uncertainties || "No uncertainty note supplied; review every historical claim."}\n\n## Evidence and limitations\n${research || "No research notes were supplied. Claims require fact-checking before publication."}\n\n## Hypotheses\nThe hook and visual structure are creative hypotheses, not causal conclusions. Compare performance against a similar experiment after publication.\n\n## Production boundary\nThis package is for external editing tools. It does not contain a rendered video, upload action, or publication instruction.\n\n## Security review\nExported content is sanitized with heuristic patterns only. Review it before sharing externally; this is not full DLP protection.\n`,
    },
    {
      name: "script.md",
      content: `# Script\n\n## Hook\n${hook}\n\n## Narration\n${script}\n\n## Reviewed supporting claims\n${supported || "No supporting claims have completed research review."}\n\n## CTA\n${cta || "Invite viewers to follow for the next history story."}\n`,
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
        factCheckStatus: draft.researchProject ? evidenceStatus(draft.researchProject) : research ? "needs_human_review" : "insufficient_evidence",
        researchProjectId: draft.researchProject?.id ?? null,
        sourceReferences: context.sources.map((source) => ({ title: clean(source.title), citation: clean(source.citationText), url: source.url ? clean(source.url) : null })),
        knownUncertainties: context.uncertainties.map(clean),
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
  const entries = files.map((file) => {
    if (!/^[a-z0-9.-]+$/.test(file.name)) throw new RangeError("Export package contains an unsafe filename");
    return {
      file,
      nameLength: Buffer.byteLength(file.name, "utf8"),
      dataLength: Buffer.byteLength(file.content, "utf8"),
    };
  });
  const localSize = entries.reduce((total, entry) => total + 30 + entry.nameLength + entry.dataLength, 0);
  const centralSize = entries.reduce((total, entry) => total + 46 + entry.nameLength, 0);
  const totalSize = localSize + centralSize + 22;
  if (totalSize > MAX_EXPORT_BYTES) throw new RangeError("Export package is too large");

  const output = Buffer.allocUnsafe(totalSize);
  const centralOffset = localSize;
  let offset = 0;
  const centralEntries: Array<{ name: Buffer; dataLength: number; checksum: number; localOffset: number }> = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.file.name, "utf8");
    const data = Buffer.from(entry.file.content, "utf8");
    const checksum = crc32(data);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    header.copy(output, offset);
    data.copy(output, offset + header.length);
    centralEntries.push({ name, dataLength: data.length, checksum, localOffset: offset });
    offset += header.length + data.length;
  }
  let centralCursor = centralOffset;
  for (const entry of centralEntries) {
    const record = Buffer.alloc(46 + entry.name.length);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt32LE(entry.checksum, 16);
    record.writeUInt32LE(entry.dataLength, 20);
    record.writeUInt32LE(entry.dataLength, 24);
    record.writeUInt16LE(entry.name.length, 28);
    record.writeUInt32LE(entry.localOffset, 42);
    entry.name.copy(record, 46);
    record.copy(output, centralCursor);
    centralCursor += record.length;
  }
  output.writeUInt32LE(0x06054b50, centralCursor);
  output.writeUInt16LE(files.length, centralCursor + 8);
  output.writeUInt16LE(files.length, centralCursor + 10);
  output.writeUInt32LE(centralSize, centralCursor + 12);
  output.writeUInt32LE(localSize, centralCursor + 16);
  if (output.length > MAX_EXPORT_BYTES) throw new RangeError("Export package is too large");
  return output;
}
