export const projectStatuses = ["active", "archived"] as const;
export const contentStatuses = ["idea", "generating", "editing", "ready", "scheduled", "published", "archived"] as const;
export const contentFormats = ["short_form", "long_form", "other"] as const;
export const productionTypes = ["new", "remaster", "repurpose", "other"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];
export type ContentStatus = (typeof contentStatuses)[number];
export type ContentFormat = (typeof contentFormats)[number];
export type ProductionType = (typeof productionTypes)[number];

export type ProjectInput = {
  name: string;
  code: string | null;
  description: string;
  status: ProjectStatus;
};

export type ContentInput = {
  projectId: string;
  contentKey: string | null;
  title: string;
  topic: string;
  format: ContentFormat;
  productionType: ProductionType;
  status: ContentStatus;
  languageCode: string;
  durationSeconds: number | null;
  notes: string;
};

const codePattern = /^[A-Z0-9][A-Z0-9-]{0,15}$/;
const keyPattern = /^[A-Z0-9][A-Z0-9-]{0,31}$/;
const languagePattern = /^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function optionalToken(value: unknown, pattern: RegExp) {
  if (value === undefined || value === null) return null;
  const token = text(value).toUpperCase();
  if (!token) return null;
  return pattern.test(token) ? token : undefined;
}

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function parseProjectInput(value: unknown): ProjectInput | null {
  const body = record(value);
  if (!body) return null;
  const name = text(body.name);
  const code = optionalToken(body.code, codePattern);
  const description = text(body.description);
  const status = text(body.status || "active");
  if (name.length < 1 || name.length > 160) return null;
  if (code === undefined) return null;
  if (description.length > 4000) return null;
  if (!projectStatuses.includes(status as ProjectStatus)) return null;
  return { name, code, description, status: status as ProjectStatus };
}

export function parseProjectPatch(value: unknown): Partial<ProjectInput> | null {
  const body = record(value);
  if (!body) return null;
  const next: Partial<ProjectInput> = {};
  if ("name" in body) {
    const name = text(body.name);
    if (name.length < 1 || name.length > 160) return null;
    next.name = name;
  }
  if ("code" in body) {
    const code = optionalToken(body.code, codePattern);
    if (code === undefined) return null;
    next.code = code;
  }
  if ("description" in body) {
    const description = text(body.description);
    if (description.length > 4000) return null;
    next.description = description;
  }
  if ("status" in body) {
    const status = text(body.status);
    if (!projectStatuses.includes(status as ProjectStatus)) return null;
    next.status = status as ProjectStatus;
  }
  return Object.keys(next).length ? next : null;
}

export function parseContentInput(value: unknown): ContentInput | null {
  const body = record(value);
  if (!body) return null;
  const projectId = text(body.projectId);
  const contentKey = optionalToken(body.contentKey, keyPattern);
  const title = text(body.title);
  const topic = text(body.topic);
  const format = text(body.format || "short_form");
  const productionType = text(body.productionType || "new");
  const status = text(body.status || "idea");
  const languageCode = text(body.languageCode || "en").toLowerCase();
  const notes = text(body.notes);
  if (!isUuid(projectId) || contentKey === undefined) return null;
  if (title.length < 1 || title.length > 200 || topic.length > 200 || notes.length > 8000) return null;
  if (!contentFormats.includes(format as ContentFormat)) return null;
  if (!productionTypes.includes(productionType as ProductionType)) return null;
  if (!contentStatuses.includes(status as ContentStatus)) return null;
  if (!languagePattern.test(languageCode)) return null;
  let durationSeconds: number | null = null;
  if (body.durationSeconds !== undefined && body.durationSeconds !== null && body.durationSeconds !== "") {
    const duration = Number(body.durationSeconds);
    if (!Number.isInteger(duration) || duration < 0 || duration > 86400) return null;
    durationSeconds = duration;
  }
  return {
    projectId,
    contentKey,
    title,
    topic,
    format: format as ContentFormat,
    productionType: productionType as ProductionType,
    status: status as ContentStatus,
    languageCode,
    durationSeconds,
    notes,
  };
}

export function parseContentPatch(value: unknown): Partial<ContentInput> | null {
  const parsed = parseContentInput({
    projectId: "00000000-0000-4000-8000-000000000001",
    title: "placeholder",
    ...record(value),
  });
  const body = record(value);
  if (!parsed || !body) return null;
  const next: Partial<ContentInput> = {};
  if ("projectId" in body) next.projectId = parsed.projectId;
  if ("contentKey" in body) next.contentKey = parsed.contentKey;
  if ("title" in body) next.title = parsed.title;
  if ("topic" in body) next.topic = parsed.topic;
  if ("format" in body) next.format = parsed.format;
  if ("productionType" in body) next.productionType = parsed.productionType;
  if ("status" in body) next.status = parsed.status;
  if ("languageCode" in body) next.languageCode = parsed.languageCode;
  if ("durationSeconds" in body) next.durationSeconds = parsed.durationSeconds;
  if ("notes" in body) next.notes = parsed.notes;
  return Object.keys(next).length ? next : null;
}

export function escapeLike(value: string) {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
