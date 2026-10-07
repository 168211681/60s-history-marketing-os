export const platforms = ["youtube", "facebook", "tiktok", "instagram"] as const;
export const platformStatuses = ["not_started", "ready", "scheduled", "published", "skipped"] as const;

export type Platform = (typeof platforms)[number];
export type PlatformStatus = (typeof platformStatuses)[number];

export type PlatformPostInput = {
  status: PlatformStatus;
  title: string;
  caption: string;
  hashtags: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  platformPostId: string | null;
};

export type PlatformPostPatch = Partial<PlatformPostInput>;

const httpsUrl = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+(:[0-9]{1,5})?(\/[^\s]*)?$/;

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isPlatform(value: string): value is Platform {
  return platforms.includes(value as Platform);
}

export function isHttpsUrl(value: string) {
  return value.length >= 12 && value.length <= 2000 && httpsUrl.test(value);
}

function optionalText(value: unknown, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const next = text(value);
  if (!next) return null;
  if (next.length > max) return undefined;
  return next;
}

function optionalTime(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export function parsePlatformPostPatch(value: unknown): PlatformPostPatch | null {
  const body = record(value);
  if (!body) return null;
  const next: PlatformPostPatch = {};
  if ("status" in body) {
    const status = text(body.status);
    if (!platformStatuses.includes(status as PlatformStatus)) return null;
    next.status = status as PlatformStatus;
  }
  if ("title" in body) {
    const title = text(body.title);
    if (title.length > 200) return null;
    next.title = title;
  }
  if ("caption" in body) {
    const caption = text(body.caption);
    if (caption.length > 5000) return null;
    next.caption = caption;
  }
  if ("hashtags" in body) {
    const hashtags = text(body.hashtags);
    if (hashtags.length > 500) return null;
    next.hashtags = hashtags;
  }
  if ("scheduledAt" in body) {
    const scheduledAt = optionalTime(body.scheduledAt);
    if (scheduledAt === undefined) return null;
    next.scheduledAt = scheduledAt;
  }
  if ("publishedAt" in body) {
    const publishedAt = optionalTime(body.publishedAt);
    if (publishedAt === undefined) return null;
    next.publishedAt = publishedAt;
  }
  if ("postUrl" in body) {
    const postUrl = optionalText(body.postUrl, 2000);
    if (postUrl === undefined) return null;
    if (postUrl && !isHttpsUrl(postUrl)) return null;
    next.postUrl = postUrl;
  }
  if ("platformPostId" in body) {
    const platformPostId = optionalText(body.platformPostId, 200);
    if (platformPostId === undefined || (platformPostId && /\s/.test(platformPostId))) return null;
    next.platformPostId = platformPostId;
  }
  return Object.keys(next).length ? next : null;
}

export function applyPlatformPatch(current: PlatformPostInput, patch: PlatformPostPatch, nowIso: string): PlatformPostInput | null {
  const next: PlatformPostInput = { ...current, ...patch };
  if (next.status === "published" && !next.publishedAt) next.publishedAt = nowIso;
  if (next.status === "scheduled" && !next.scheduledAt) return null;
  if (next.status === "published" && !next.publishedAt) return null;
  if (next.postUrl && !isHttpsUrl(next.postUrl)) return null;
  if (next.title.length > 200 || next.caption.length > 5000 || next.hashtags.length > 500) return null;
  return next;
}

export function distributionSummary(statuses: readonly PlatformStatus[]) {
  const complete = statuses.filter((status) => status === "published" || status === "skipped").length;
  const remaining = statuses.filter((status) => status === "not_started" || status === "ready").length;
  return { complete, remaining, total: platforms.length, label: `${complete}/${platforms.length}` };
}

export function queueMembership(posts: readonly { status: PlatformStatus; publishedAt: string | null }[], now = Date.now()) {
  const recentWindow = 30 * 24 * 60 * 60 * 1000;
  return {
    needsAction: posts.some((post) => post.status === "not_started" || post.status === "ready"),
    scheduled: posts.some((post) => post.status === "scheduled"),
    recentlyPublished: posts.some((post) => {
      if (post.status !== "published" || !post.publishedAt) return false;
      const published = Date.parse(post.publishedAt);
      return Number.isFinite(published) && now - published <= recentWindow && now >= published;
    }),
  };
}

export function platformCopyAll(post: { title: string; caption: string; hashtags: string }) {
  return [post.title.trim(), post.caption.trim(), post.hashtags.trim()].filter(Boolean).join("\n\n");
}
