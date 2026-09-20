import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { storeVideoArtifact } from "./artifacts";
import type { VideoGenerationProvider, VideoGenerationRequest } from "./provider";

const execFileAsync = promisify(execFile);
const WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php";
const IMAGE_COUNT = 3;
const IMAGE_SECONDS = 4;

type WikimediaImage = { url: string; title: string; license: string };

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
    return [{ url, title: page.title ?? "Wikimedia Commons image", license }];
  });
}

async function findFreeImages(request: VideoGenerationRequest): Promise<WikimediaImage[]> {
  const queries = [searchTerms(request), "ancient computer", "history archive", "public domain history"];
  const images: WikimediaImage[] = [];
  for (const query of queries) {
    const results = await searchFreeImages(query);
    for (const image of results) {
      if (!images.some((existing) => existing.url === image.url)) images.push(image);
      if (images.length === IMAGE_COUNT) return images;
    }
  }
  throw new Error("PUBLIC_DOMAIN_IMAGES_UNAVAILABLE");
}

async function downloadImage(url: string, path: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("PUBLIC_DOMAIN_IMAGE_DOWNLOAD_FAILED");
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("PUBLIC_DOMAIN_IMAGE_INVALID_TYPE");
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
}

async function renderSlideshow(images: string[], outputPath: string) {
  if (!ffmpegPath) throw new Error("PUBLIC_DOMAIN_FFMPEG_UNAVAILABLE");
  const filters = images.map((_, index) => `[${index}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v${index}]`).join(";");
  const concat = `${images.map((_, index) => `[v${index}]`).join("")}concat=n=${images.length}:v=1:a=0[outv]`;
  const args = ["-y", ...images.flatMap((image) => ["-loop", "1", "-t", String(IMAGE_SECONDS), "-i", image]), "-filter_complex", `${filters};${concat}`, "-map", "[outv]", "-r", "30", "-c:v", "libx264", "-movflags", "+faststart", "-pix_fmt", "yuv420p", outputPath];
  await execFileAsync(ffmpegPath, args, { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
}

export function publicDomainProvider(): VideoGenerationProvider {
  return {
    name: "public-domain",
    configured: true,
    async submit(request) {
      const images = await findFreeImages(request);
      const workdir = await mkdtemp(join(tmpdir(), "marketing-os-images-"));
      try {
        await mkdir(workdir, { recursive: true });
        const paths = await Promise.all(images.map((_, index) => join(workdir, `image-${index}.jpg`)));
        await Promise.all(images.map((image, index) => downloadImage(image.url, paths[index])));
        const outputPath = join(workdir, "slideshow.mp4");
        await renderSlideshow(paths, outputPath);
        const stored = await storeVideoArtifact(await readFile(outputPath), "video/mp4");
        return {
          externalJobId: stored.path,
          artifactUrl: stored.artifactUrl,
          sourceAttribution: images.map((image) => `${image.title} (${image.license})`).join("; "),
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
