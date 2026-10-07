import "server-only";
import { database, transaction } from "@/lib/database";
import { youtubeImportSql, youtubePreviewSql } from "./import-sql.mjs";

export type YoutubeImportPreview = {
  projectName: string;
  channelTitles: string[];
  found: number;
  newItems: number;
  alreadyImported: number;
  invalid: number;
};

export type YoutubeImportResult = {
  found: number;
  created: number;
  alreadyLinked: number;
  updated: number;
  skipped: number;
};

type PreviewRow = {
  project_name: string;
  channel_titles: string[] | null;
  found: string | number;
  new_items: string | number;
  already_imported: string | number;
  invalid: string | number;
};

type ImportRow = {
  project_found: boolean;
  found: string | number;
  created: string | number;
  created_posts: string | number;
  already_linked: string | number;
  updated: string | number;
  skipped: string | number;
};

function count(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Import count is invalid");
  return parsed;
}

export async function previewYoutubeImport(ownerId: string, projectId: string): Promise<YoutubeImportPreview | null> {
  const result = await database().query<PreviewRow>(youtubePreviewSql, [projectId, ownerId]);
  const row = result.rows[0];
  if (!row) return null;
  const preview = {
    projectName: row.project_name,
    channelTitles: row.channel_titles ?? [],
    found: count(row.found),
    newItems: count(row.new_items),
    alreadyImported: count(row.already_imported),
    invalid: count(row.invalid),
  };
  if (preview.newItems + preview.alreadyImported + preview.invalid !== preview.found) {
    throw new Error("Import preview did not partition the source");
  }
  return preview;
}

export async function importYoutubeLibrary(ownerId: string, projectId: string): Promise<YoutubeImportResult | null> {
  return transaction(async (client) => {
    const result = await client.query<ImportRow>(youtubeImportSql, [projectId, ownerId]);
    const row = result.rows[0];
    if (!row?.project_found) return null;
    const imported = {
      found: count(row.found),
      created: count(row.created),
      alreadyLinked: count(row.already_linked),
      updated: count(row.updated),
      skipped: count(row.skipped),
    };
    if (count(row.created_posts) !== imported.created * 4) {
      throw new Error("Import did not create four platform rows");
    }
    if (imported.created + imported.alreadyLinked + imported.skipped !== imported.found) {
      throw new Error("Import result did not partition the source");
    }
    return imported;
  });
}
