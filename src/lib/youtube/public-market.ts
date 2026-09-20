const api = "https://www.googleapis.com/youtube/v3";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("YOUTUBE_PUBLIC_RESPONSE_INVALID");
  return value as JsonObject;
}

function items(value: unknown): JsonObject[] {
  const list = object(value).items;
  if (!Array.isArray(list)) throw new Error("YOUTUBE_PUBLIC_RESPONSE_INVALID");
  return list.map(object);
}

function stringValue(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function count(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function durationSeconds(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isFinite(seconds) ? seconds : null;
}

export type PublicMarketVideo = {
  youtubeVideoId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

export type PublicMarketChannel = { youtubeChannelId: string; title: string; channelUrl: string; videos: PublicMarketVideo[] };

export function normalizeYouTubeChannelId(value: string) {
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{1,128}$/.test(input)) return input;
  if (/^@[A-Za-z0-9._-]{1,100}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) return null;
    return /^\/channel\/([A-Za-z0-9_-]{1,128})\/?$/.exec(url.pathname)?.[1]
      ?? /^\/@([A-Za-z0-9._-]{1,100})\/?$/.exec(url.pathname)?.[0].slice(1)
      ?? null;
  } catch {
    return null;
  }
}

async function get(path: string, params: Record<string, string>, fetcher: typeof fetch) {
  const key = process.env.YOUTUBE_DATA_API_KEY;
  if (!key) throw new Error("YOUTUBE_DATA_API_KEY_NOT_CONFIGURED");
  const url = new URL(`${api}/${path}`);
  Object.entries({ ...params, key }).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { errors?: Array<{ reason?: unknown }>; status?: unknown } } | null;
    const reason = payload?.error?.errors?.[0]?.reason;
    if (typeof reason === "string" && /^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(reason)) throw new Error(`YOUTUBE_PUBLIC_API_${response.status}_${reason}`);
    throw new Error(`YOUTUBE_PUBLIC_API_${response.status}`);
  }
  return response.json();
}

export async function fetchPublicMarketChannel(channelId: string, fetcher: typeof fetch = fetch): Promise<PublicMarketChannel> {
  const normalizedChannelId = normalizeYouTubeChannelId(channelId);
  if (!normalizedChannelId) throw new Error("YOUTUBE_CHANNEL_ID_INVALID");
  const channelPayload = await get(
    "channels",
    { part: "snippet,contentDetails", ...(normalizedChannelId.startsWith("@") ? { forHandle: normalizedChannelId } : { id: normalizedChannelId }) },
    fetcher,
  );
  const channel = items(channelPayload)[0];
  if (!channel) throw new Error("YOUTUBE_CHANNEL_NOT_FOUND");
  const resolvedChannelId = stringValue(channel.id, "YOUTUBE_CHANNEL_ID_INVALID");
  const snippet = object(channel.snippet);
  const details = object(channel.contentDetails);
  const related = object(details.relatedPlaylists);
  const uploads = stringValue(related.uploads, "YOUTUBE_UPLOADS_PLAYLIST_MISSING");
  const playlistPayload = await get("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "50" }, fetcher);
  const ids = items(playlistPayload).map((item) => stringValue(object(item.contentDetails).videoId, "YOUTUBE_VIDEO_ID_INVALID"));
  const videos = ids.length ? items(await get("videos", { part: "snippet,contentDetails,statistics", id: ids.join(",") }, fetcher)) : [];
  return {
    youtubeChannelId: resolvedChannelId,
    title: stringValue(snippet.title, "YOUTUBE_CHANNEL_TITLE_INVALID"),
    channelUrl: `https://www.youtube.com/channel/${resolvedChannelId}`,
    videos: videos.flatMap((video) => {
      const videoSnippet = object(video.snippet);
      const publishedAt = stringValue(videoSnippet.publishedAt, "YOUTUBE_VIDEO_DATE_INVALID");
      if (Number.isNaN(Date.parse(publishedAt))) return [];
      const statistics = object(video.statistics);
      const details = object(video.contentDetails);
      return [{
        youtubeVideoId: stringValue(video.id, "YOUTUBE_VIDEO_ID_INVALID"),
        title: stringValue(videoSnippet.title, "YOUTUBE_VIDEO_TITLE_INVALID"),
        publishedAt,
        durationSeconds: durationSeconds(details.duration),
        views: count(statistics.viewCount), likes: count(statistics.likeCount), comments: count(statistics.commentCount),
      }];
    }),
  };
}
