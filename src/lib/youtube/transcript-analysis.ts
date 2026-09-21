export type TranscriptTerm = { term: string; count: number };

export type TranscriptAnalysis = {
  characterCount: number;
  tokenCount: number;
  sentenceCount: number;
  questionCount: number;
  exclamationCount: number;
  estimatedDurationSeconds: number;
  opening: string;
  repeatedTerms: TranscriptTerm[];
};

const ignoredTerms = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "which", "who", "why", "with", "you",
]);

function tokens(transcript: string) {
  return transcript.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

export function analyzeTranscript(transcript: string): TranscriptAnalysis {
  const normalized = transcript.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("VIDEO_TRANSCRIPT_EMPTY");
  const terms = tokens(normalized);
  const counts = new Map<string, number>();
  for (const term of terms) {
    if (term.length < 3 || ignoredTerms.has(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const repeatedTerms = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));
  const sentences = normalized.split(/[.!?。！？]+/u).map((sentence) => sentence.trim()).filter(Boolean);
  const opening = normalized.match(/^.*?(?:[.!?。！？](?=\s|$)|$)/u)?.[0].trim() || normalized.slice(0, 240);
  return {
    characterCount: normalized.length,
    tokenCount: terms.length,
    sentenceCount: sentences.length,
    questionCount: (normalized.match(/[?？]/gu) ?? []).length,
    exclamationCount: (normalized.match(/[!！]/gu) ?? []).length,
    estimatedDurationSeconds: Math.max(1, Math.round(terms.length / 2.5)),
    opening: opening.slice(0, 240),
    repeatedTerms,
  };
}
