import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appOrigin, ownerId } from "../src/lib/auth/config";
import { decryptToken, encryptToken, sameSecret, tokenEncryptionConfigured } from "../src/lib/youtube/crypto";
import { authorizationUrl, exchangeCode, newOAuthState, ownerChannel, refreshAccessToken, revokeToken, uploadVideoPrivate, youtubeScopes } from "../src/lib/youtube/google";
import {
  defaultSyncPeriod,
  durationSeconds,
  fetchAnalytics,
  fetchUploadVideoIds,
  fetchVideoMetadata,
  YouTubeSyncError,
} from "../src/lib/youtube/sync";

const previous = {
  APP_ORIGIN: process.env.APP_ORIGIN,
  OWNER_USER_ID: process.env.OWNER_USER_ID,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
};
after(() => {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const google = { clientId: "test-client", clientSecret: "test-secret", redirectUri: "https://example.test/api/youtube/callback" };
const channel = { id: "UC" + "a".repeat(22), snippet: { title: "60s History" } };

test("configuration accepts only a fixed origin and UUID owner", () => {
  process.env.APP_ORIGIN = "https://example.test";
  process.env.OWNER_USER_ID = "10000000-0000-4000-8000-000000000001";
  assert.equal(appOrigin(), "https://example.test");
  assert.equal(ownerId(), process.env.OWNER_USER_ID);
  process.env.APP_ORIGIN = "https://example.test/path";
  assert.equal(appOrigin(), null);
  process.env.APP_ORIGIN = "http://example.test";
  assert.equal(appOrigin(), null);
  process.env.OWNER_USER_ID = "not-an-id";
  assert.equal(ownerId(), null);
});

test("refresh token encryption round-trips and detects tampering", () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  assert.equal(tokenEncryptionConfigured(), true);
  const encrypted = encryptToken("private-refresh-token");
  assert.notEqual(encrypted.includes("private-refresh-token"), true);
  assert.equal(decryptToken(encrypted), "private-refresh-token");
  const parts = encrypted.split(".");
  parts[2] = parts[2].replace(/.$/, parts[2].endsWith("A") ? "B" : "A");
  assert.throws(() => decryptToken(parts.join(".")));
  process.env.TOKEN_ENCRYPTION_KEY = "invalid";
  assert.equal(tokenEncryptionConfigured(), false);
  assert.throws(() => decryptToken(encrypted));
});

test("OAuth request uses analytics and upload scopes, offline access, state, and PKCE", () => {
  const first = newOAuthState();
  const second = newOAuthState();
  assert.notEqual(first.state, second.state);
  assert.equal(sameSecret(first.state, first.state), true);
  assert.equal(sameSecret(first.state, second.state), false);
  const url = authorizationUrl(google, first.state, first.verifier);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), [...youtubeScopes]);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("state"), first.state);
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(first.verifier).digest("base64url"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("YouTube upload uses a resumable private-video session", async () => {
  const calls: string[] = [];
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://cdn.example/video.mp4") return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } });
    if (url.includes("upload/youtube/v3/videos")) {
      assert.equal(init?.method, "POST");
      assert.match(String(init?.body), /"privacyStatus":"private"/);
      return new Response(null, { status: 200, headers: { location: "https://upload.example/session-1" } });
    }
    assert.equal(url, "https://upload.example/session-1");
    assert.equal(init?.method, "PUT");
    return Response.json({ id: "youtube-video-1" });
  }) as typeof fetch;
  assert.deepEqual(await uploadVideoPrivate("access", "https://cdn.example/video.mp4", { title: "History", description: "A short" }, fetcher), { youtubeVideoId: "youtube-video-1" });
  assert.equal(calls.length, 3);
});

test("code exchange requires refresh token and complete scopes", async () => {
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    assert.equal(String(url), "https://oauth2.googleapis.com/token");
    const body = init?.body as URLSearchParams;
    assert.equal(body.get("code_verifier"), "verifier");
    assert.equal(body.get("client_secret"), "test-secret");
    return Response.json({ access_token: "access", refresh_token: "refresh", scope: youtubeScopes.join(" ") });
  }) as typeof fetch;
  assert.deepEqual(await exchangeCode(google, "code", "verifier", fetcher), {
    accessToken: "access", refreshToken: "refresh", scopes: youtubeScopes.join(" "),
  });
  await assert.rejects(exchangeCode(google, "code", "verifier", (async () => Response.json({ access_token: "access" })) as typeof fetch));
  await assert.rejects(exchangeCode(google, "code", "verifier", (async () => Response.json({ access_token: "access", refresh_token: "refresh", scope: youtubeScopes[0] })) as typeof fetch));
});

test("channel lookup validates the authenticated channel response", async () => {
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    assert.equal(new URL(String(url)).searchParams.get("mine"), "true");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer access");
    return Response.json({ items: [channel] });
  }) as typeof fetch;
  assert.deepEqual(await ownerChannel("access", fetcher), { id: channel.id, title: "60s History" });
  await assert.rejects(ownerChannel("access", (async () => Response.json({ items: [] })) as typeof fetch));
  await assert.rejects(ownerChannel("access", (async () => Response.json({ items: [channel, channel] })) as typeof fetch));
});

test("refresh and revocation send tokens in POST bodies", async () => {
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    const body = init?.body as URLSearchParams;
    if (String(url).endsWith("/token")) {
      assert.equal(body.get("refresh_token"), "refresh");
      return Response.json({ access_token: "new-access" });
    }
    assert.equal(body.get("token"), "refresh");
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  assert.equal(await refreshAccessToken(google, "refresh", fetcher), "new-access");
  assert.equal(await revokeToken("refresh", fetcher), true);
});

test("sync period uses the latest 28 complete UTC days and parses ISO durations", () => {
  assert.deepEqual(defaultSyncPeriod(new Date("2026-09-19T23:59:59Z")), { start: "2026-08-22", end: "2026-09-18" });
  assert.equal(durationSeconds("PT1M2.5S"), 62.5);
  assert.equal(durationSeconds("P1DT2H"), 93600);
  assert.throws(() => durationSeconds("1 minute"), YouTubeSyncError);
});

test("upload discovery paginates, retries transient errors, and validates the channel", async () => {
  const expectedChannel = "UC" + "b".repeat(22);
  let channelAttempts = 0;
  const waits: number[] = [];
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/channels")) {
      channelAttempts += 1;
      if (channelAttempts === 1) return new Response(null, { status: 500 });
      return Response.json({ items: [{ id: expectedChannel, contentDetails: { relatedPlaylists: { uploads: "UUuploads" } } }] });
    }
    assert.equal(url.searchParams.get("playlistId"), "UUuploads");
    if (!url.searchParams.get("pageToken")) {
      return Response.json({ items: [{ contentDetails: { videoId: "aaaaaaaaaaa" } }], nextPageToken: "next" });
    }
    assert.equal(url.searchParams.get("pageToken"), "next");
    return Response.json({ items: [{ contentDetails: { videoId: "bbbbbbbbbbb" } }] });
  }) as typeof fetch;
  assert.deepEqual(await fetchUploadVideoIds("access", expectedChannel, { fetcher, sleep: async (ms) => { waits.push(ms); } }), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.equal(channelAttempts, 2);
  assert.deepEqual(waits, [250]);
});

test("Google 403 quota responses are distinguished from authorization failures", async () => {
  const fetcher = (async () => Response.json({
    error: { errors: [{ reason: "quotaExceeded" }] },
  }, { status: 403 })) as typeof fetch;
  await assert.rejects(
    fetchUploadVideoIds("access", "UC" + "q".repeat(22), { fetcher }),
    (error: unknown) => error instanceof YouTubeSyncError && error.code === "QUOTA",
  );
});

test("video metadata is batched and rejects a mismatched channel", async () => {
  const expectedChannel = "UC" + "c".repeat(22);
  const valid = {
    id: "ccccccccccc",
    snippet: { channelId: expectedChannel, title: "  A short history  ", publishedAt: "2026-09-01T12:00:00Z" },
    contentDetails: { duration: "PT59S" },
  };
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("part"), "snippet,contentDetails");
    return Response.json({ items: [valid] });
  }) as typeof fetch;
  assert.deepEqual(await fetchVideoMetadata("access", expectedChannel, [valid.id], { fetcher }), [{
    youtubeVideoId: valid.id, title: "A short history", publishedAt: "2026-09-01T12:00:00Z", durationSeconds: 59,
  }]);
  await assert.rejects(fetchVideoMetadata("access", "UC" + "d".repeat(22), [valid.id], { fetcher }), YouTubeSyncError);
});

test("analytics parsing uses response headers, preserves missing rows, and batches 500 video filters", async () => {
  const ids = Array.from({ length: 501 }, (_, index) => String(index).padStart(11, "0"));
  const filters: string[] = [];
  const metricHeaders = ["views", "estimatedMinutesWatched", "averageViewDuration", "subscribersGained", "subscribersLost", "likes", "comments"];
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const filter = url.searchParams.get("filters");
    if (!filter) {
      return Response.json({
        columnHeaders: [...metricHeaders, "day"].map((name) => ({ name })),
        rows: [[100, 25.5, 15.3, 4, 1, 8, 2, "2026-09-18"]],
      });
    }
    filters.push(filter);
    return Response.json({ columnHeaders: ["day", "video", ...metricHeaders].map((name) => ({ name })) });
  }) as typeof fetch;
  const result = await fetchAnalytics("access", { start: "2026-08-22", end: "2026-09-18" }, ids, { fetcher });
  assert.deepEqual(result.channelMetrics, [{
    metricDate: "2026-09-18", views: "100", estimatedMinutesWatched: "25.5",
    averageViewDurationSeconds: "15.3", subscribersGained: "4", subscribersLost: "1",
    likes: "8", comments: "2",
  }]);
  assert.deepEqual(result.videoMetrics, []);
  assert.equal(filters.length, 2);
  assert.equal(filters[0].replace("video==", "").split(",").length, 500);
  assert.equal(filters[1].replace("video==", "").split(",").length, 1);
});
