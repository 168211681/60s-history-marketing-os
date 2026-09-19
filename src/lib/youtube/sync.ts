const dataApi = "https://www.googleapis.com/youtube/v3";
const analyticsApi = "https://youtubeanalytics.googleapis.com/v2/reports";
const metrics = [
  "views",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "subscribersGained",
  "subscribersLost",
  "likes",
  "comments",
] as const;

export type SyncPeriod = { start: string; end: string };
export type VideoMetadata = {
  youtubeVideoId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number;
};
export type MetricValues = {
  views: string | null;
  estimatedMinutesWatched: string | null;
  averageViewDurationSeconds: string | null;
  subscribersGained: string | null;
  subscribersLost: string | null;
  likes: string | null;
  comments: string | null;
};
export type ChannelMetric = MetricValues & { metricDate: string };
export type VideoMetric = ChannelMetric & { youtubeVideoId: string };

export class YouTubeSyncError extends Error {
  constructor(public readonly code: "AUTH" | "QUOTA" | "TRANSIENT" | "PROVIDER" | "VALIDATION", message: string) {
    super(message);
    this.name = "YouTubeSyncError";
  }
}

type ClientOptions = {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number) {
  const header = response.headers.get("retry-after");
  const retryAfter = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 5000);
  return 250 * 2 ** attempt;
}

async function googleErrorReason(response: Response) {
  try {
    const payload = object(await response.clone().json());
    const error = object(payload.error);
    if (!Array.isArray(error.errors)) return null;
    for (const detail of error.errors.slice(0, 10)) {
      const reason = object(detail).reason;
      if (typeof reason === "string") return reason;
    }
  } catch {
    return null;
  }
  return null;
}

async function getJson(url: URL, accessToken: string, options: ClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? wait;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      if (attempt === 2) throw new YouTubeSyncError("TRANSIENT", "YouTube request failed after retries");
      await sleep(250 * 2 ** attempt);
      continue;
    }
    lastStatus = response.status;
    if (response.ok) {
      try {
        return await response.json() as unknown;
      } catch {
        throw new YouTubeSyncError("PROVIDER", "YouTube returned invalid JSON");
      }
    }
    const reason = response.status === 403 ? await googleErrorReason(response) : null;
    const quotaReason = reason === "quotaExceeded" || reason === "dailyLimitExceeded";
    const rateReason = reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
    if (quotaReason || rateReason) lastStatus = 429;
    if ((response.status === 429 || response.status >= 500 || rateReason) && attempt < 2) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    break;
  }
  if (lastStatus === 401 || lastStatus === 403) throw new YouTubeSyncError("AUTH", "YouTube authorization was rejected");
  if (lastStatus === 429) throw new YouTubeSyncError("QUOTA", "YouTube quota was exceeded");
  if (lastStatus >= 500) throw new YouTubeSyncError("TRANSIENT", "YouTube service remained unavailable");
  throw new YouTubeSyncError("PROVIDER", "YouTube request was rejected");
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new YouTubeSyncError("VALIDATION", "YouTube response shape is invalid");
  return value as Record<string, unknown>;
}

function items(value: unknown) {
  const list = object(value).items;
  if (!Array.isArray(list)) throw new YouTubeSyncError("VALIDATION", "YouTube response items are invalid");
  return list;
}

function videoId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(value)) throw new YouTubeSyncError("VALIDATION", "YouTube video ID is invalid");
  return value;
}

function splitInto<T>(values: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size));
  return batches;
}

export function defaultSyncPeriod(now = new Date()): SyncPeriod {
  if (Number.isNaN(now.getTime())) throw new YouTubeSyncError("VALIDATION", "Sync clock is invalid");
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function durationSeconds(duration: unknown) {
  if (typeof duration !== "string") throw new YouTubeSyncError("VALIDATION", "Video duration is invalid");
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration);
  if (!match || match.slice(1).every((part) => part === undefined)) throw new YouTubeSyncError("VALIDATION", "Video duration is invalid");
  const total = Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  if (!Number.isFinite(total) || total < 0) throw new YouTubeSyncError("VALIDATION", "Video duration is invalid");
  return total;
}

export async function fetchUploadVideoIds(accessToken: string, expectedChannelId: string, options: ClientOptions = {}) {
  const channelUrl = new URL(`${dataApi}/channels`);
  channelUrl.searchParams.set("part", "contentDetails");
  channelUrl.searchParams.set("mine", "true");
  const channelItems = items(await getJson(channelUrl, accessToken, options));
  if (channelItems.length !== 1) throw new YouTubeSyncError("VALIDATION", "Expected one authorized channel");
  const channel = object(channelItems[0]);
  if (channel.id !== expectedChannelId) throw new YouTubeSyncError("AUTH", "Authorized channel changed");
  const contentDetails = object(channel.contentDetails);
  const related = object(contentDetails.relatedPlaylists);
  if (typeof related.uploads !== "string" || !related.uploads) throw new YouTubeSyncError("VALIDATION", "Uploads playlist is unavailable");

  const ids: string[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`${dataApi}/playlistItems`);
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("playlistId", related.uploads);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = object(await getJson(url, accessToken, options));
    for (const item of items(payload)) ids.push(videoId(object(object(item).contentDetails).videoId));
    const next = payload.nextPageToken;
    if (next === undefined) return [...new Set(ids)];
    if (typeof next !== "string" || !next) throw new YouTubeSyncError("VALIDATION", "YouTube page token is invalid");
    if (seenTokens.has(next)) throw new YouTubeSyncError("VALIDATION", "YouTube page token repeated");
    seenTokens.add(next);
    pageToken = next;
  }
  throw new YouTubeSyncError("VALIDATION", "Uploads playlist exceeded the safe pagination limit");
}

export async function fetchVideoMetadata(accessToken: string, expectedChannelId: string, ids: string[], options: ClientOptions = {}) {
  const videos: VideoMetadata[] = [];
  for (const batch of splitInto(ids, 50)) {
    const url = new URL(`${dataApi}/videos`);
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("id", batch.join(","));
    const payload = await getJson(url, accessToken, options);
    for (const raw of items(payload)) {
      const item = object(raw);
      const snippet = object(item.snippet);
      const details = object(item.contentDetails);
      const title = typeof snippet.title === "string" ? snippet.title.trim() : "";
      const publishedAt = typeof snippet.publishedAt === "string" ? snippet.publishedAt : "";
      if (snippet.channelId !== expectedChannelId || !title || title.length > 300 || !publishedAt || Number.isNaN(Date.parse(publishedAt))) {
        throw new YouTubeSyncError("VALIDATION", "Video metadata is invalid");
      }
      videos.push({ youtubeVideoId: videoId(item.id), title, publishedAt, durationSeconds: durationSeconds(details.duration) });
    }
  }
  return videos;
}

type ResultTable = { columnHeaders: { name: string }[]; rows: unknown[][] };

function resultTable(value: unknown): ResultTable {
  const payload = object(value);
  if (!Array.isArray(payload.columnHeaders)) throw new YouTubeSyncError("VALIDATION", "Analytics headers are invalid");
  const columnHeaders = payload.columnHeaders.map((header) => {
    const name = object(header).name;
    if (typeof name !== "string" || !name) throw new YouTubeSyncError("VALIDATION", "Analytics header is invalid");
    return { name };
  });
  const rows = payload.rows === undefined ? [] : payload.rows;
  if (!Array.isArray(rows) || !rows.every(Array.isArray)) throw new YouTubeSyncError("VALIDATION", "Analytics rows are invalid");
  return { columnHeaders, rows: rows as unknown[][] };
}

function numeric(value: unknown, integer: boolean) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new YouTubeSyncError("VALIDATION", "Analytics metric is invalid");
  }
  return String(value);
}

function parseMetrics(table: ResultTable, includeVideo: boolean) {
  const columns = new Map(table.columnHeaders.map((header, index) => [header.name, index]));
  for (const required of ["day", ...(includeVideo ? ["video"] : []), ...metrics]) {
    if (!columns.has(required)) throw new YouTubeSyncError("VALIDATION", `Analytics column ${required} is missing`);
  }
  return table.rows.map((row) => {
    const get = (name: string) => row[columns.get(name)!];
    const metricDate = get("day");
    if (typeof metricDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) throw new YouTubeSyncError("VALIDATION", "Analytics date is invalid");
    return {
      ...(includeVideo ? { youtubeVideoId: videoId(get("video")) } : {}),
      metricDate,
      views: numeric(get("views"), true),
      estimatedMinutesWatched: numeric(get("estimatedMinutesWatched"), false),
      averageViewDurationSeconds: numeric(get("averageViewDuration"), false),
      subscribersGained: numeric(get("subscribersGained"), true),
      subscribersLost: numeric(get("subscribersLost"), true),
      likes: numeric(get("likes"), true),
      comments: numeric(get("comments"), true),
    };
  });
}

async function analyticsRows(accessToken: string, period: SyncPeriod, videoIds: string[] | null, options: ClientOptions) {
  const collected: ReturnType<typeof parseMetrics> = [];
  for (let page = 0; page < 100; page += 1) {
    const startIndex = page * 1000 + 1;
    const url = new URL(analyticsApi);
    url.searchParams.set("ids", "channel==MINE");
    url.searchParams.set("startDate", period.start);
    url.searchParams.set("endDate", period.end);
    url.searchParams.set("metrics", metrics.join(","));
    url.searchParams.set("dimensions", videoIds ? "day,video" : "day");
    url.searchParams.set("sort", videoIds ? "day,video" : "day");
    url.searchParams.set("maxResults", "1000");
    url.searchParams.set("startIndex", String(startIndex));
    if (videoIds) url.searchParams.set("filters", `video==${videoIds.join(",")}`);
    const table = resultTable(await getJson(url, accessToken, options));
    const parsed = parseMetrics(table, Boolean(videoIds));
    if (parsed.some((row) => row.metricDate < period.start || row.metricDate > period.end)) {
      throw new YouTubeSyncError("VALIDATION", "Analytics date is outside the requested period");
    }
    collected.push(...parsed);
    if (table.rows.length < 1000) return collected;
  }
  throw new YouTubeSyncError("VALIDATION", "Analytics report exceeded the safe pagination limit");
}

export async function fetchAnalytics(accessToken: string, period: SyncPeriod, videoIds: string[], options: ClientOptions = {}) {
  const channelMetrics = await analyticsRows(accessToken, period, null, options) as ChannelMetric[];
  const videoMetrics: VideoMetric[] = [];
  for (const batch of splitInto(videoIds, 500)) {
    videoMetrics.push(...await analyticsRows(accessToken, period, batch, options) as VideoMetric[]);
  }
  return { channelMetrics, videoMetrics };
}
