export type ClaimVerdict = "supported" | "disputed" | "insufficient" | "false" | "contextual";
export type EvidenceStatus = "not_researched" | "research_in_progress" | "reviewed" | "insufficient_evidence";

export type ResearchSource = {
  id: string; sourceType: string; title: string; publisher: string; author: string | null;
  publishedAt: string | null; url: string | null; citationText: string;
  notes: string; reliabilityNote: string;
};
export type ResearchClaim = {
  id: string; claimText: string; verdict: ClaimVerdict; confidence: "low" | "medium" | "high";
  reviewerNote: string; sources: { sourceId: string; relationship: "supports" | "contradicts" | "contextualizes" }[];
};
export type ResearchProject = {
  id: string; channelId: string; contentIdeaId: string | null; experimentId: string | null;
  scriptDraftId: string | null; topic: string; status: "draft" | "researching" | "review" | "approved" | "rejected";
  researchQuestion: string; summary: string; confidenceNote: string;
  sources: ResearchSource[]; claims: ResearchClaim[];
};

export function evidenceStatus(project: ResearchProject | null): EvidenceStatus {
  if (!project) return "not_researched";
  if (project.status !== "approved") return "research_in_progress";
  const unresolved = project.claims.some((claim) => claim.verdict !== "supported" && claim.verdict !== "contextual");
  return project.sources.length && project.claims.length && !unresolved ? "reviewed" : "insufficient_evidence";
}

export function canApproveResearch(project: ResearchProject) {
  return project.status === "review" && project.sources.length > 0 && project.claims.length > 0 &&
    project.claims.every((claim) => claim.verdict !== "insufficient" && claim.reviewerNote.trim().length > 0 &&
      (claim.verdict !== "supported" || claim.sources.some((link) => link.relationship === "supports" && project.sources.some((source) => source.id === link.sourceId))));
}

export function factCheckedContext(project: ResearchProject | null) {
  if (!project) return { evidenceStatus: "not_researched" as EvidenceStatus, facts: [], supportedClaims: [], disputedClaims: [], insufficientClaims: [], sources: [], uncertainties: ["No linked research project was reviewed."] };
  const approved = project.status === "approved";
  return {
    evidenceStatus: evidenceStatus(project),
    facts: [], // Source observations are never promoted to independent facts automatically.
    supportedClaims: approved ? project.claims.filter((claim) => claim.verdict === "supported" && claim.sources.some((link) => link.relationship === "supports")) : [],
    disputedClaims: project.claims.filter((claim) => claim.verdict === "disputed" || claim.verdict === "false"),
    insufficientClaims: project.claims.filter((claim) => claim.verdict === "insufficient" || !approved),
    sources: project.sources,
    uncertainties: [project.confidenceNote, ...project.claims.filter((claim) => claim.verdict !== "supported").map((claim) => claim.reviewerNote)].filter(Boolean),
  };
}
