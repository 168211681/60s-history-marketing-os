import type { PoolClient } from "pg";
import { database, transaction } from "@/lib/database";
import { escapeLike, type ContentInput, type ContentStatus, type ProjectInput } from "./model";

export type ProjectRecord = {
  id: string;
  name: string;
  code: string | null;
  description: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type ContentRecord = {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string | null;
  contentKey: string | null;
  title: string;
  topic: string;
  format: ContentInput["format"];
  productionType: ContentInput["productionType"];
  status: ContentStatus;
  languageCode: string;
  durationSeconds: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  description: string;
  status: ProjectRecord["status"];
  created_at: Date | string;
  updated_at: Date | string;
};

type ContentRow = {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string | null;
  content_key: string | null;
  title: string;
  topic: string;
  format: ContentRecord["format"];
  production_type: ContentRecord["productionType"];
  status: ContentStatus;
  language_code: string;
  duration_seconds: number | null;
  notes: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function project(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
function content(row: ContentRow): ContentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectCode: row.project_code,
    contentKey: row.content_key,
    title: row.title,
    topic: row.topic,
    format: row.format,
    productionType: row.production_type,
    status: row.status,
    languageCode: row.language_code,
    durationSeconds: row.duration_seconds,
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const contentSelect = `
  select i.id, i.project_id, p.name as project_name, p.code as project_code,
         i.content_key, i.title, i.topic, i.format, i.production_type, i.status,
         i.language_code, i.duration_seconds, i.notes, i.created_at, i.updated_at
    from public.content_items i
    join public.projects p on p.id = i.project_id and p.owner_id = i.owner_id
   where i.owner_id = $1`;

export async function listProjects(ownerId: string) {
  const result = await database().query<ProjectRow>(
    `select id, name, code, description, status, created_at, updated_at
       from public.projects
      where owner_id = $1
      order by updated_at desc, name asc`,
    [ownerId],
  );
  return result.rows.map(project);
}

export async function getProject(ownerId: string, id: string) {
  const result = await database().query<ProjectRow>(
    `select id, name, code, description, status, created_at, updated_at
       from public.projects
      where owner_id = $1 and id = $2`,
    [ownerId, id],
  );
  return result.rows[0] ? project(result.rows[0]) : null;
}

export async function createProject(ownerId: string, input: ProjectInput) {
  return transaction(async (client) => {
    await client.query("insert into public.users (id) values ($1) on conflict (id) do nothing", [ownerId]);
    const result = await client.query<ProjectRow>(
      `insert into public.projects (owner_id, name, code, description, status)
       values ($1, $2, $3, $4, $5)
       returning id, name, code, description, status, created_at, updated_at`,
      [ownerId, input.name, input.code, input.description, input.status],
    );
    return project(result.rows[0]);
  });
}

export async function updateProject(ownerId: string, id: string, input: Partial<ProjectInput>) {
  const values: unknown[] = [];
  const sets: string[] = [];
  for (const [column, value] of [
    ["name", input.name],
    ["code", input.code],
    ["description", input.description],
    ["status", input.status],
  ] as const) {
    if (value !== undefined) {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (!sets.length) return null;
  values.push(id, ownerId);
  const result = await database().query<ProjectRow>(
    `update public.projects set ${sets.join(", ")}
      where id = $${values.length - 1} and owner_id = $${values.length}
      returning id, name, code, description, status, created_at, updated_at`,
    values,
  );
  return result.rows[0] ? project(result.rows[0]) : null;
}

export async function listContentItems(ownerId: string, filter: { projectId?: string; status?: ContentStatus; query?: string }) {
  const values: unknown[] = [ownerId];
  const where = ["i.owner_id = $1"];
  if (filter.projectId) {
    values.push(filter.projectId);
    where.push(`i.project_id = $${values.length}`);
  }
  if (filter.status) {
    values.push(filter.status);
    where.push(`i.status = $${values.length}`);
  }
  if (filter.query) {
    values.push(escapeLike(filter.query));
    where.push(`(i.title ilike $${values.length} escape '\\' or i.topic ilike $${values.length} escape '\\' or i.content_key ilike $${values.length} escape '\\')`);
  }
  const result = await database().query<ContentRow>(
    `${contentSelect.replace("where i.owner_id = $1", `where ${where.join(" and ")}`)}
     order by i.updated_at desc, i.title asc`,
    values,
  );
  return result.rows.map(content);
}

export async function getContentItem(ownerId: string, id: string) {
  const result = await database().query<ContentRow>(`${contentSelect} and i.id = $2`, [ownerId, id]);
  return result.rows[0] ? content(result.rows[0]) : null;
}

async function ownedProject(client: PoolClient, ownerId: string, projectId: string) {
  const result = await client.query("select 1 from public.projects where id = $1 and owner_id = $2", [projectId, ownerId]);
  return result.rowCount === 1;
}

export async function createContentItem(ownerId: string, input: ContentInput) {
  return transaction(async (client) => {
    if (!(await ownedProject(client, ownerId, input.projectId))) return null;
    const result = await client.query<ContentRow>(
      `insert into public.content_items (
         project_id, owner_id, content_key, title, topic, format, production_type,
         status, language_code, duration_seconds, notes
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id, project_id,
         (select name from public.projects where id = project_id) as project_name,
         (select code from public.projects where id = project_id) as project_code,
         content_key, title, topic, format, production_type, status, language_code,
         duration_seconds, notes, created_at, updated_at`,
      [
        input.projectId, ownerId, input.contentKey, input.title, input.topic, input.format,
        input.productionType, input.status, input.languageCode, input.durationSeconds, input.notes,
      ],
    );
    return content(result.rows[0]);
  });
}

export async function updateContentItem(ownerId: string, id: string, input: Partial<ContentInput>) {
  return transaction(async (client) => {
    if (input.projectId && !(await ownedProject(client, ownerId, input.projectId))) return null;
    const values: unknown[] = [];
    const sets: string[] = [];
    for (const [column, value] of [
      ["project_id", input.projectId],
      ["content_key", input.contentKey],
      ["title", input.title],
      ["topic", input.topic],
      ["format", input.format],
      ["production_type", input.productionType],
      ["status", input.status],
      ["language_code", input.languageCode],
      ["duration_seconds", input.durationSeconds],
      ["notes", input.notes],
    ] as const) {
      if (value !== undefined) {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
    }
    if (!sets.length) return null;
    values.push(id, ownerId);
    const result = await client.query<ContentRow>(
      `update public.content_items set ${sets.join(", ")}
        where id = $${values.length - 1} and owner_id = $${values.length}
        returning id, project_id,
          (select name from public.projects where id = project_id) as project_name,
          (select code from public.projects where id = project_id) as project_code,
          content_key, title, topic, format, production_type, status, language_code,
          duration_seconds, notes, created_at, updated_at`,
      values,
    );
    return result.rows[0] ? content(result.rows[0]) : null;
  });
}
