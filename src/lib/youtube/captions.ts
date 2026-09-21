const captionsApi = "https://www.googleapis.com/youtube/v3/captions";

export type CaptionTrack = {
  id: string;
  languageCode: string;
  trackKind: "standard" | "ASR" | "forced" | "unknown";
};

export class YouTubeCaptionError extends Error {
  constructor(public readonly code: "AUTH" | "NOT_FOUND" | "PROVIDER" | "VALIDATION", message: string) {
    super(message);
    this.name = "YouTubeCaptionError";
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new YouTubeCaptionError("VALIDATION", "YouTube caption response shape is invalid");
  return value as Record<string, unknown>;
}

function trackKind(value: unknown): CaptionTrack["trackKind"] {
  return value === "ASR" || value === "forced" || value === "standard" ? value : "unknown";
}

function videoId(value: string) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(value)) throw new YouTubeCaptionError("VALIDATION", "YouTube video ID is invalid");
}

export async function listCaptionTracks(accessToken: string, youtubeVideoId: string, fetcher: typeof fetch = fetch) {
  videoId(youtubeVideoId);
  const url = new URL(captionsApi);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", youtubeVideoId);
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (response.status === 401 || response.status === 403) throw new YouTubeCaptionError("AUTH", "YouTube captions authorization was rejected");
  if (response.status === 404) throw new YouTubeCaptionError("NOT_FOUND", "YouTube captions were not found");
  if (!response.ok) throw new YouTubeCaptionError("PROVIDER", "YouTube captions request failed");
  const payload = object(await response.json());
  if (!Array.isArray(payload.items)) throw new YouTubeCaptionError("VALIDATION", "YouTube caption tracks are invalid");
  return payload.items.flatMap((item): CaptionTrack[] => {
    try {
      const value = object(item);
      const snippet = object(value.snippet);
      const id = value.id;
      const languageCode = snippet.language;
      if (typeof id !== "string" || !id || typeof languageCode !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || languageCode.length > 35) return [];
      return [{ id, languageCode, trackKind: trackKind(snippet.trackKind) }];
    } catch {
      return [];
    }
  });
}

function cleanCaptionText(value: string) {
  const lines = value.replace(/^\uFEFF/, "").split(/\r?\n/);
  const output: string[] = [];
  let previous = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "WEBVTT" || line.startsWith("NOTE") || /^\d+$/.test(line) || line.includes(" --> ")) continue;
    const cleaned = line.replace(/<\/?[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    if (!cleaned || cleaned === previous) continue;
    output.push(cleaned);
    previous = cleaned;
  }
  const transcript = output.join(" ").replace(/\s+/g, " ").trim();
  if (!transcript || transcript.length > 100000) throw new YouTubeCaptionError("VALIDATION", "YouTube caption text is empty or too large");
  return transcript;
}

export async function downloadCaptionTrack(accessToken: string, track: CaptionTrack, fetcher: typeof fetch = fetch) {
  const url = new URL(`${captionsApi}/${encodeURIComponent(track.id)}`);
  url.searchParams.set("tfmt", "vtt");
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (response.status === 401 || response.status === 403) throw new YouTubeCaptionError("AUTH", "YouTube caption download authorization was rejected");
  if (response.status === 404) throw new YouTubeCaptionError("NOT_FOUND", "YouTube caption track was not found");
  if (!response.ok) throw new YouTubeCaptionError("PROVIDER", "YouTube caption download failed");
  return cleanCaptionText(await response.text());
}

export async function fetchBestCaption(accessToken: string, youtubeVideoId: string, fetcher: typeof fetch = fetch) {
  const tracks = await listCaptionTracks(accessToken, youtubeVideoId, fetcher);
  const track = tracks.find((item) => item.trackKind === "standard") ?? tracks.find((item) => item.trackKind === "ASR") ?? tracks.find((item) => item.trackKind === "forced") ?? tracks[0];
  if (!track) throw new YouTubeCaptionError("NOT_FOUND", "No captions are available for this video");
  return { track, transcript: await downloadCaptionTrack(accessToken, track, fetcher) };
}
