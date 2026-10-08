export const h60ProjectCode = "H60";

export const h60Pillars = [
  "Hidden Engineering",
  "Why Did They Do This?",
  "Ancient Technology",
  "Battlefield Problems",
  "Weird History",
] as const;

export type H60Pillar = (typeof h60Pillars)[number];

export function isH60Pillar(value: string): value is H60Pillar {
  return h60Pillars.includes(value as H60Pillar);
}

export function pillarAllowed(projectCode: string | null, pillar: string) {
  if (pillar.length > 80) return false;
  if (projectCode !== h60ProjectCode) return true;
  return pillar === "" || isH60Pillar(pillar);
}

export function effectiveContentPillar(currentPillar: string, patchPillar: string | undefined) {
  return patchPillar !== undefined ? patchPillar : currentPillar;
}
