import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { storeVideoArtifact } from "./artifacts";
import type { VideoGenerationProvider, VideoGenerationRequest } from "./provider";
import { voiceProvider } from "./voice";

const execFileAsync = promisify(execFile);
const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const IMAGE_COUNT = 3;
const MIN_IMAGE_SECONDS = 4;
const MAX_IMAGE_SECONDS = 20;

type WikimediaImage = { url: string; originalUrl: string; title: string; license: string };

function searchTerms(request: VideoGenerationRequest) {
  return `${request.title} ${request.sceneCues}`.replace(/[\n\r]+/g, " ").trim().slice(0, 180) || "history";
}

async function searchFreeImages(query: string): Promise<WikimediaImage[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "search",
    gsrsearch: query, gsrnamespace: "6", gsrlimit: "20", prop: "imageinfo",
    iiprop: "url|mime|extmetadata", iiurlwidth: "720",
  });
  const response = await fetch(`${WIKIMEDIA_API}?${params}`, { headers: { "user-agent": "60s-history-marketing-os/1.0" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("PUBLIC_DOMAIN_SEARCH_FAILED");
  const payload = (await response.json()) as { query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ thumburl?: string; url?: string; mime?: string; extmetadata?: { LicenseShortName?: { value?: string } } }> }> } };
  return Object.values(payload.query?.pages ?? {}).flatMap((page) => {
    const info = page.imageinfo?.[0];
    const url = info?.thumburl ?? info?.url;
    const license = info?.extmetadata?.LicenseShortName?.value?.trim() ?? "";
    if (!url || !/^https:\/\//.test(url) || !info?.mime?.startsWith("image/") || !/(public domain|cc0|cc by|cc-by|cc by-sa|cc-by-sa)/i.test(license)) return [];
    return [{ url, originalUrl: info.url ?? url, title: page.title ?? "Wikimedia Commons image", license }];
  });
}

async function findFreeImages(request: VideoGenerationRequest): Promise<WikimediaImage[]> {
  const queries = [searchTerms(request), "ancient computer", "history archive", "public domain history"];
  const images: WikimediaImage[] = [];
  for (const query of queries) {
    const results = await searchFreeImages(query);
    for (const image of results) {
      if (!images.some((existing) => existing.originalUrl === image.originalUrl)) images.push(image);
      if (images.length === IMAGE_COUNT) return images;
    }
  }
  throw new Error("PUBLIC_DOMAIN_IMAGES_UNAVAILABLE");
}

async function downloadImage(image: Pick<WikimediaImage, "url" | "originalUrl" | "title">, path: string) {
  let lastError = "PUBLIC_DOMAIN_IMAGE_DOWNLOAD_FAILED";
  const fileName = image.title.replace(/^File:/i, "");
  const specialFilePath = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=960`;
  for (const url of [image.url, image.originalUrl, specialFilePath]) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "60s-history-marketing-os/1.0" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) { lastError = `PUBLIC_DOMAIN_IMAGE_HTTP_${response.status}`; continue; }
      const contentType = response.headers.get("content-type") ?? "";
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!contentType.startsWith("image/") && contentType !== "application/octet-stream") { lastError = "PUBLIC_DOMAIN_IMAGE_INVALID_TYPE"; continue; }
      if (bytes.byteLength < 100) { lastError = "PUBLIC_DOMAIN_IMAGE_EMPTY"; continue; }
      await writeFile(path, bytes);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function renderSlideshow(images: string[], outputPath: string, audioPath: string | null, narration: string) {
  if (!ffmpegPath) throw new Error("PUBLIC_DOMAIN_FFMPEG_UNAVAILABLE");
  const imageSeconds = Math.min(MAX_IMAGE_SECONDS, Math.max(MIN_IMAGE_SECONDS, Math.ceil(narration.length / 15 / images.length)));
  const filters = images.map((_, index) => `[${index}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v${index}]`).join(";");
  const concat = `${images.map((_, index) => `[v${index}]`).join("")}concat=n=${images.length}:v=1:a=0[outv]`;
  const audioArgs = audioPath ? ["-i", audioPath] : [];
  const audioMap = audioPath ? ["-map", `${images.length}:a:0`, "-c:a", "aac", "-b:a", "128k", "-shortest"] : [];
  const args = ["-y", ...images.flatMap((image) => ["-loop", "1", "-t", String(imageSeconds), "-i", image]), ...audioArgs, "-filter_complex", `${filters};${concat}`, "-map", "[outv]", ...audioMap, "-r", "30", "-c:v", "libx264", "-movflags", "+faststart", "-pix_fmt", "yuv420p", outputPath];
  await execFileAsync(ffmpegPath, args, { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
}

export function publicDomainProvider(): VideoGenerationProvider {
  return {
    name: "public-domain",
    configured: true,
    async submit(request) {
      const uploaded = (request.imageAssets ?? []).filter((asset) => /^https:\/\//.test(asset.url)).slice(0, IMAGE_COUNT)
        .map((asset) => ({ url: asset.url, originalUrl: asset.url, title: asset.path, license: "Owner uploaded" }));
      const images = [...uploaded];
      if (images.length < IMAGE_COUNT) {
        for (const image of await findFreeImages(request)) {
          if (!images.some((existing) => existing.originalUrl === image.originalUrl)) images.push(image);
          if (images.length === IMAGE_COUNT) break;
        }
      }
      const workdir = await mkdtemp(join(tmpdir(), "marketing-os-images-"));
      try {
        await mkdir(workdir, { recursive: true });
        const downloaded: Array<{ image: WikimediaImage; path: string }> = [];
        for (const image of images) {
          const path = join(workdir, `image-${downloaded.length}.jpg`);
          try {
            await downloadImage(image, path);
            downloaded.push({ image, path });
          } catch (error) {
            console.warn("public-domain image skipped", { title: image.title, error: error instanceof Error ? error.message : "unknown" });
          }
          if (downloaded.length === IMAGE_COUNT) break;
        }
        if (downloaded.length < IMAGE_COUNT) throw new Error("PUBLIC_DOMAIN_IMAGES_UNAVAILABLE");
        const paths = downloaded.map((item) => item.path);
        const voice = voiceProvider();
        const narration = `${request.scriptBody}\n\n${request.captionText}`.trim();
        let audioPath: string | null = null;
        if (process.env.VIDEO_REQUIRE_VOICE === "true") {
          if (!voice.configured) throw new Error("VOICE_NOT_CONFIGURED");
          const audio = await voice.synthesize(narration);
          audioPath = join(workdir, "narration.wav");
          await writeFile(audioPath, audio.bytes);
        }
        const outputPath = join(workdir, "slideshow.mp4");
        await renderSlideshow(paths, outputPath, audioPath, narration);
        const stored = await storeVideoArtifact(await readFile(outputPath), "video/mp4");
        return {
          externalJobId: stored.path,
          artifactUrl: stored.artifactUrl,
          sourceAttribution: downloaded.map(({ image }) => `${image.title} (${image.license})`).join("; "),
        };
      } finally {
        await rm(workdir, { recursive: true, force: true });
      }
    },
    async status() {
      throw new Error("PUBLIC_DOMAIN_STATUS_UNSUPPORTED");
    },
  };
}
