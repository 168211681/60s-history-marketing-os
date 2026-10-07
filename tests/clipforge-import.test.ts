import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentItemFields } from "../src/components/content-item-form";
import { PlatformTimingFields } from "../src/components/platform-matrix";
import { YoutubeImportButton, YoutubeImportView, youtubeImportActionLabel } from "../src/components/youtube-import";
import { bindImportSql, youtubeImportSql, youtubePreviewSql } from "../src/lib/clipforge/import-sql.mjs";
import { platforms } from "../src/lib/clipforge/distribution";

const projectId = "a2000000-0000-4000-8000-0000000000aa";

test("manual content fields keep technical metadata out of the way", () => {
  const html = renderToStaticMarkup(createElement(ContentItemFields, {
    projects: [{ id: projectId, name: "History in 60s", code: "H60" }],
    defaultProjectId: projectId,
  }));
  assert.match(html, /name="projectId" required=""/);
  assert.match(html, /required=""[^>]*name="title"/);
  assert.match(html, /Advanced metadata/);
  assert.match(html, /value="unknown"[^>]*selected/);
  const advancedAt = html.indexOf("Advanced metadata");
  const keyAt = html.indexOf('name="contentKey"');
  const languageAt = html.indexOf('name="languageCode"');
  const durationAt = html.indexOf('name="durationSeconds"');
  assert.ok(advancedAt > 0 && keyAt > advancedAt && languageAt > advancedAt && durationAt > advancedAt);
  assert.doesNotMatch(html.slice(keyAt, keyAt + 180), /required/);
  assert.doesNotMatch(html.slice(languageAt, languageAt + 160), /required/);
  assert.match(html, /name="languageCode"[^>]*value="und"|value="und"[^>]*name="languageCode"/);
  assert.doesNotMatch(html.slice(durationAt, durationAt + 200), /required/);
  const form = readFileSync("src/components/content-item-form.tsx", "utf8");
  assert.match(form, /Create content/);
  assert.doesNotMatch(form, /Create content item/);
});

test("published platform rows hide the scheduled time", () => {
  const published = renderToStaticMarkup(createElement(PlatformTimingFields, {
    status: "published",
    scheduledAt: "2024-01-01T00:00",
    publishedAt: "",
    savedPublishedAt: null,
  }));
  assert.match(published, /Published at/);
  assert.match(published, /unknown/);
  assert.doesNotMatch(published, /Scheduled time/);
  const scheduled = renderToStaticMarkup(createElement(PlatformTimingFields, {
    status: "scheduled",
    scheduledAt: "2024-01-01T00:00",
    publishedAt: "",
    savedPublishedAt: null,
  }));
  assert.match(scheduled, /Scheduled time/);
  assert.doesNotMatch(scheduled, /Published at/);
});

test("YouTube import preview is counts only and import stays explicit", () => {
  assert.equal(youtubeImportActionLabel(41), "Import 41 videos");
  assert.equal(youtubeImportActionLabel(0), "Nothing to import");
  const idle = renderToStaticMarkup(createElement(YoutubeImportView, {
    projectId,
    projectName: "History in 60s",
    preview: null,
    result: null,
    message: null,
  }));
  assert.match(idle, /Source: YouTube/);
  assert.match(idle, /Preview does not write/);
  assert.doesNotMatch(idle, /Import 41 videos|access_token|refresh_token/);
  const preview = renderToStaticMarkup(createElement(YoutubeImportView, {
    projectId,
    projectName: "History in 60s",
    preview: {
      projectName: "History in 60s",
      channelTitles: ["History in 60s"],
      found: 41,
      newItems: 41,
      alreadyImported: 0,
      invalid: 0,
    },
    result: null,
    message: null,
  }));
  assert.match(preview, /41/);
  assert.match(preview, /Already imported/);
  assert.match(preview, /Project: History in 60s/);
  assert.doesNotMatch(preview, /watch\?v=|access_token|refresh_token/);
  const done = renderToStaticMarkup(createElement(YoutubeImportView, {
    projectId,
    projectName: "History in 60s",
    preview: null,
    result: { found: 41, created: 41, alreadyLinked: 0, updated: 0, skipped: 0 },
    message: null,
  }));
  assert.match(done, /Created/);
  assert.match(done, /Already linked/);
  assert.match(done, new RegExp(`/library\\?project=${projectId}`));
  const panel = readFileSync("src/components/youtube-import.tsx", "utf8");
  const page = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
  assert.match(panel, /Preview import/);
  assert.match(panel, /youtube-import\/preview/);
  assert.match(panel, /youtubeImportActionLabel/);
  assert.doesNotMatch(panel, /useEffect|Import again|openai|generateText|access_token|refresh_token|OWNER_USER_ID/);
  assert.ok(panel.indexOf("Preview import") < panel.lastIndexOf("YoutubeImportButton"));
  assert.match(page, /Import \/ Sync content/);
  assert.ok(page.indexOf("Import / Sync content") < page.indexOf("Add content"));
  const server = readFileSync("src/lib/clipforge/import-youtube.ts", "utf8");
  assert.match(server, /import "server-only"/);
  assert.match(server, /previewYoutubeImport/);
  assert.doesNotMatch(server, /fetch\(|youtube\.googleapis|generateText|openai/);
  assert.doesNotMatch(`${youtubePreviewSql}\n${youtubeImportSql}`, /security definer|service_role/i);
  assert.match(youtubeImportSql, /'published', 'und'/);
  assert.doesNotMatch(youtubeImportSql, /'published', 'en'/);
  assert.match(youtubePreviewSql, /from usable u where exists/);
  assert.match(youtubeImportSql, /from usable u where exists/);
  assert.match(youtubePreviewSql, /count\(\*\) from source\) - \(select count\(\*\) from usable\) as invalid/);
  assert.match(youtubeImportSql, /count\(\*\) from source\) - \(select count\(\*\) from usable\) as skipped/);
  for (const platform of platforms) assert.match(youtubeImportSql, new RegExp(`'${platform}'`));
  assert.throws(() => bindImportSql(youtubeImportSql, "not-a-uuid", projectId), /invalid/i);
});

test("nothing to import stays disabled and a finished import refreshes the preview", () => {
  assert.equal(youtubeImportActionLabel(3), "Import 3 videos");
  assert.equal(youtubeImportActionLabel(0), "Nothing to import");
  const ready = renderToStaticMarkup(createElement(YoutubeImportButton, { newItems: 3, importing: false, locked: false }));
  assert.match(ready, /Import 3 videos/);
  assert.doesNotMatch(ready, /disabled|Nothing to import|Import again/);
  const empty = renderToStaticMarkup(createElement(YoutubeImportButton, { newItems: 0, importing: false, locked: false }));
  assert.match(empty, /disabled=""/);
  assert.match(empty, /Nothing to import/);
  assert.doesNotMatch(empty, /Import again/);
  const panel = readFileSync("src/components/youtube-import.tsx", "utf8");
  const imported = panel.slice(panel.indexOf("async function importLibrary"));
  const recorded = imported.indexOf("setResult(payload as ImportResult)");
  const refreshed = imported.indexOf("youtube-import/preview");
  assert.ok(recorded > 0 && refreshed > recorded);
  assert.doesNotMatch(imported, /setResult\(null\)/);
  const both = renderToStaticMarkup(createElement(YoutubeImportView, {
    projectId,
    projectName: "History in 60s",
    preview: {
      projectName: "History in 60s",
      channelTitles: ["History in 60s"],
      found: 6,
      newItems: 0,
      alreadyImported: 3,
      invalid: 3,
    },
    result: { found: 6, created: 3, alreadyLinked: 0, updated: 0, skipped: 3 },
    message: null,
  }));
  assert.match(both, /<dt>New<\/dt><dd>0<\/dd>/);
  assert.match(both, /<dt>Already imported<\/dt><dd>3<\/dd>/);
  assert.match(both, /<dt>Created<\/dt><dd>3<\/dd>/);
  assert.match(both, /Already linked/);
});

test("the legacy import migration does not rewrite earlier ClipForge files", () => {
  const migration = readFileSync("supabase/migrations/20261007143000_clipforge_legacy_youtube_import.sql", "utf8");
  assert.match(migration, /platform_posts_owner_platform_post_id_idx/);
  assert.match(migration, /where platform_post_id is not null/);
  assert.match(migration, /'unknown'/);
  assert.match(migration, /language_code = 'und'/);
  assert.match(migration, /language_code set default 'und'/);
  assert.match(migration, /\^\[a-z\]\{2\}/);
  assert.doesNotMatch(migration, /security definer|storage\.objects|drop table/i);
  const projects = createHash("sha256").update(readFileSync("supabase/migrations/20261006175601_clipforge_projects_and_content_items.sql")).digest("hex");
  const assets = createHash("sha256").update(readFileSync("supabase/migrations/20261006210730_clipforge_distribution_assets.sql")).digest("hex");
  assert.equal(projects, "391b1d1c19f79621028a4a82ebad30495f512c296ab0f99008759bd7706a0a2f");
  assert.equal(assets, "2d94709e761998d9bf8dd7da387e1e1a94e426cff9e3e21062aa476f2cd7b431");
});
