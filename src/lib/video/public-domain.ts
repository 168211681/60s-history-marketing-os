import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { storeVideoArtifact } from "./artifacts";
import type { VideoGenerationProvider } from "./provider";
import { voiceProvider } from "./voice";

const execFileAsync = promisify(execFile);
const IMAGE_COUNT = 3;
const MIN_IMAGE_SECONDS = 4;
const MAX_IMAGE_SECONDS = 20;

type WikimediaImage = { url: string; originalUrl: string; title: string; license: string };

async function downloadImage(image: Pick<WikimediaImage, "url" | "originalUrl" | "title" | "license">, path: string) {
  let lastError = "PUBLIC_DOMAIN_IMAGE_DOWNLOAD_FAILED";
  const fileName = image.title.replace(/^File:/i, "");
  const specialFilePath = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=960`;
  const urls = image.license === "Owner uploaded" ? [image.url] : [image.url, image.originalUrl, specialFilePath];
  for (const url of urls) {
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
  const args = ["-y", ...images.flatMap((image) => ["-loop", "1", "-t", String(imageSeconds), "-i", image]), ...audioArgs, "-filter_complex", `${filters};${concat}`, "-map", "[outv]", ...audioMap, "-r", "30", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-movflags", "+faststart", "-pix_fmt", "yuv420p", outputPath];
  try {
    await execFileAsync(ffmpegPath, args, { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 });
  } catch (error) {
    const failure = error as { code?: unknown; signal?: unknown; stderr?: unknown; stdout?: unknown };
    console.error("slideshow render failed", {
      code: failure.code ?? null,
      signal: failure.signal ?? null,
      stderr: typeof failure.stderr === "string" ? failure.stderr.slice(-4000) : "",
      stdout: typeof failure.stdout === "string" ? failure.stdout.slice(-1000) : "",
    });
    throw new Error("VIDEO_RENDER_FAILED");
  }
}

export function publicDomainProvider(): VideoGenerationProvider {
  return {
    name: "public-domain",
    configured: true,
    async submit(request) {
      const available = (request.imageAssets ?? []).filter((asset) => /^https:\/\//.test(asset.url));
      const plannedPaths = request.editPlan?.scenes.map((scene) => scene.assetPath) ?? [];
      const ordered = plannedPaths.length
        ? [...plannedPaths.map((path) => available.find((asset) => asset.path === path)).filter((asset): asset is { path: string; url: string } => Boolean(asset)), ...available]
        : available;
      const uploaded = ordered.filter((asset, index, assets) => assets.findIndex((candidate) => candidate.path === asset.path) === index)
        .map((asset) => ({ url: asset.url, originalUrl: asset.url, title: asset.path, license: "Owner uploaded" }));
      if (!uploaded.length) throw new Error("IMAGE_ASSETS_REQUIRED");
      const workdir = await mkdtemp(join(tmpdir(), "marketing-os-images-"));
      try {
        await mkdir(workdir, { recursive: true });
        const downloaded: Array<{ image: WikimediaImage; path: string }> = [];
        for (const image of uploaded) {
          const path = join(workdir, `image-${downloaded.length}.jpg`);
          try {
            await downloadImage(image, path);
            downloaded.push({ image, path });
          } catch (error) {
            console.warn("public-domain image skipped", { title: image.title, error: error instanceof Error ? error.message : "unknown" });
          }
          if (downloaded.length === IMAGE_COUNT) break;
        }
        if (!downloaded.length) throw new Error("UPLOADED_IMAGE_DOWNLOAD_FAILED");
        const paths = Array.from({ length: IMAGE_COUNT }, (_, index) => downloaded[index % downloaded.length].path);
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
