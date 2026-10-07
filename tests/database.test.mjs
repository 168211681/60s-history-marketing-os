import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deleteResearchProjectSql } from "../src/lib/research/delete-query.mjs";
import { bindImportSql, youtubeImportSql, youtubePreviewSql } from "../src/lib/clipforge/import-sql.mjs";

// Only a newly created local cluster is used. DATABASE_URL and all PG* variables
// are ignored so tests can never reset or connect to an existing database.
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("PG") && key !== "DATABASE_URL",
  ),
);
const root = mkdtempSync(join(tmpdir(), "marketing-os-db-"));
chmodSync(root, 0o700);
const dataDir = join(root, "data");
let binDir;
let started = false;
const pgEnv = {
  ...baseEnv,
  PGHOST: root,
  PGPORT: "5432",
  PGUSER: "postgres",
  PGDATABASE: "postgres",
};

function run(binary, args, input) {
  const result = spawnSync(binary, args, {
    env: pgEnv,
    input,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error) throw result.error;
  return result;
}
function command(binary, args) {
  const result = run(binary, args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function sql(statement, expectedError) {
  const result = run(
    join(binDir, "psql"),
    ["-X", "-qAt", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose"],
    statement,
  );
  if (expectedError) {
    assert.notEqual(result.status, 0, "SQL should have been denied");
    assert.match(result.stderr, new RegExp(`ERROR: +${expectedError}:`));
    return;
  }
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function asRole(role, uid, statement, error) {
  assert.ok(["authenticated", "anon", "service_role"].includes(role));
  assert.match(uid, /^[0-9a-f-]*$/);
  return sql(
    `begin; set local role ${role}; set local request.jwt.claim.sub = '${uid}'; ${statement}; rollback;`,
    error,
  );
}
const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const channelA = "20000000-0000-4000-8000-000000000001";
const channelB = "20000000-0000-4000-8000-000000000002";
const videoA = "30000000-0000-4000-8000-000000000001";
const ideaA = "40000000-0000-4000-8000-000000000001";
const ideaB = "40000000-0000-4000-8000-000000000002";
const tables = [
  "users",
  "channels",
  "videos",
  "video_metrics",
  "channel_metrics",
  "marketing_insights",
  "content_ideas",
  "content_experiments",
];

before(() => {
  binDir = command("pg_config", ["--bindir"]);
  command(join(binDir, "initdb"), [
    "-D",
    dataDir,
    "--username=postgres",
    "--auth-local=trust",
    "--auth-host=reject",
    "--encoding=UTF8",
    "--no-locale",
  ]);
  // No TCP listener. The Unix socket is inside a user-only directory.
  command(join(binDir, "pg_ctl"), [
    "-D",
    dataDir,
    "-l",
    join(root, "postgres.log"),
    "-o",
    `-F -k ${root} -h '' -p 5432`,
    "-w",
    "start",
  ]);
  started = true;
  sql(readFileSync("tests/database/bootstrap.sql", "utf8"));
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    sql(readFileSync(join("supabase/migrations", file), "utf8"));
  }
  sql(readFileSync("tests/database/fixtures.sql", "utf8"));
});
after(() => {
  if (started)
    command(join(binDir, "pg_ctl"), [
      "-D",
      dataDir,
      "-m",
      "fast",
      "-w",
      "stop",
    ]);
  // Remove only the disposable directory created by this process.
  rmSync(root, { recursive: true, force: true });
});

test("migrations create protected tables with forced RLS and safe grants", () => {
  assert.equal(
    sql(
      "select count(*) from pg_tables where schemaname in ('public', 'private')",
    ),
    "24",
  );
  assert.equal(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity",
    ),
      "24",
  );
  assert.equal(sql("select has_table_privilege('authenticated','private.production_workflow_events','select')"), "f");
  assert.equal(sql("select has_table_privilege('service_role','private.production_workflow_events','insert')"), "t");
  assert.equal(
    sql(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef",
    ),
    "0",
  );
  for (const table of tables) {
    assert.equal(
      sql(`select has_table_privilege('anon','public.${table}','select')`),
      "f",
    );
    assert.equal(
      sql(
        `select has_table_privilege('authenticated','public.${table}','truncate')`,
      ),
      "f",
    );
    assert.equal(
      sql(
        `select has_table_privilege('service_role','public.${table}','truncate')`,
      ),
      "f",
    );
  }
  for (const table of ["projects", "content_items", "content_assets", "platform_posts"]) {
    assert.equal(sql(`select has_table_privilege('anon','public.${table}','select')`), "f");
    assert.equal(sql(`select has_table_privilege('authenticated','public.${table}','truncate')`), "f");
    assert.equal(sql(`select has_table_privilege('service_role','public.${table}','truncate')`), "f");
    assert.equal(sql(`select has_table_privilege('authenticated','public.${table}','select')`), "t");
    assert.equal(sql(`select has_table_privilege('authenticated','public.${table}','delete')`), "t");
  }
});
test("research sources, claims and relationships stay inside the owner's project", () => {
  const projectA = "60000000-0000-4000-8000-000000000001";
  const projectB = "60000000-0000-4000-8000-000000000002";
  const sourceA = "70000000-0000-4000-8000-000000000001";
  const sourceB = "70000000-0000-4000-8000-000000000002";
  const claimA = "80000000-0000-4000-8000-000000000001";
  sql(`insert into public.research_projects (id,channel_id,content_idea_id,topic) values
    ('${projectA}','${channelA}','${ideaA}','Synthetic history topic'),
    ('${projectB}','${channelB}','${ideaB}','Other synthetic topic')`);
  sql(`insert into public.research_sources (id,research_project_id,source_type,title,citation_text) values
    ('${sourceA}','${projectA}','museum_archive','Synthetic source','A source observation'),
    ('${sourceB}','${projectB}','unknown','Other source','Other observation')`);
  sql(`insert into public.research_claims (id,research_project_id,claim_text) values
    ('${claimA}','${projectA}','A claim requiring evidence')`);
  sql(`insert into public.research_claim_sources (research_project_id,claim_id,source_id,relationship) values
    ('${projectA}','${claimA}','${sourceA}','supports')`);
  for (const table of ["research_projects", "research_sources", "research_claims", "research_claim_sources"]) {
    const ownerFilter = table === "research_projects" ? `id='${projectA}'` : `research_project_id='${projectA}'`;
    assert.equal(asRole("authenticated", userA, `select count(*) from public.${table}`), "1");
    asRole("anon", "", `select * from public.${table}`, "42501");
    asRole("authenticated", userA, `insert into public.${table} default values`, "42501");
    assert.equal(asRole("authenticated", userB, `select count(*) from public.${table} where ${ownerFilter}`), "0");
  }
  sql(`insert into public.research_claim_sources (research_project_id,claim_id,source_id,relationship)
    values ('${projectA}','${claimA}','${sourceB}','supports')`, "23503");
  sql(`insert into public.research_projects (channel_id,content_idea_id,topic)
    values ('${channelA}','${ideaB}','Wrong-channel idea')`, "23503");
  assert.equal(sql(`select verdict from public.research_claims where id='${claimA}'`), "insufficient");
  assert.equal(sql(`select count(*) from public.research_claim_sources where claim_id='${claimA}'`), "1");
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'research_%' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity"), "4");
});
test("owner deletion cascades research children but preserves linked channel content", () => {
  const scriptDraft = "90000000-0000-4000-8000-000000000001";
  sql(`insert into public.script_drafts (id,channel_id,title,hook,script_body,status)
    values ('${scriptDraft}','${channelA}','Smoke test fixture','Question hook','Temporary local test script','approved');
    update public.research_projects set experiment_id='50000000-0000-4000-8000-000000000001',
      script_draft_id='${scriptDraft}',status='approved' where id='60000000-0000-4000-8000-000000000001'`);
  const replaceIds = (id, ownerId) => deleteResearchProjectSql
    .replace("$1", `'${id}'`)
    .replace("$2", `'${ownerId}'`);
  const projectA = "60000000-0000-4000-8000-000000000001";
  assert.equal(sql(replaceIds(projectA, userB)), "");
  assert.equal(sql(`select count(*) from public.research_projects where id='${projectA}'`), "1");
  assert.equal(sql(replaceIds("60000000-0000-4000-8000-000000000099", userA)), "");
  assert.equal(sql(replaceIds(projectA, userA)), projectA);
  assert.equal(sql(`select
    (select count(*) from public.research_sources where research_project_id='${projectA}') || '|' ||
    (select count(*) from public.research_claims where research_project_id='${projectA}') || '|' ||
    (select count(*) from public.research_claim_sources where research_project_id='${projectA}')`), "0|0|0");
  assert.equal(sql(`select
    (select count(*) from public.channels where id='${channelA}') || '|' ||
    (select count(*) from public.content_ideas where id='${ideaA}') || '|' ||
    (select count(*) from public.content_experiments where id='50000000-0000-4000-8000-000000000001') || '|' ||
    (select count(*) from public.script_drafts where id='${scriptDraft}')`), "1|1|1|1");
});
for (const table of tables) {
  test(`${table}: each owner reads only their own row; missing identity reads none`, () => {
    assert.equal(
      asRole("authenticated", userA, `select count(*) from public.${table}`),
      "1",
    );
    assert.equal(
      asRole("authenticated", userB, `select count(*) from public.${table}`),
      "1",
    );
    assert.equal(
      asRole("authenticated", "", `select count(*) from public.${table}`),
      "0",
    );
    const field =
      table === "users"
        ? "id"
        : table === "channels"
          ? "owner_id"
          : "channel_id";
    const forbidden =
      table === "users" || table === "channels" ? userB : channelB;
    assert.equal(
      asRole(
        "authenticated",
        userA,
        `select count(*) from public.${table} where ${field}='${forbidden}'`,
      ),
      "0",
    );
    asRole("anon", "", `select * from public.${table}`, "42501");
  });
}
test("anonymous role cannot write any public table", () => {
  for (const table of tables) {
    asRole("anon", "", `insert into public.${table} default values`, "42501");
    asRole("anon", "", `update public.${table} set updated_at=now()`, "42501");
    asRole("anon", "", `delete from public.${table}`, "42501");
  }
});
test("authenticated owners cannot forge backend-owned data or transfer channels", () => {
  for (const table of tables.filter((name) => name !== "content_ideas")) {
    asRole(
      "authenticated",
      userA,
      `insert into public.${table} default values`,
      "42501",
    );
    asRole(
      "authenticated",
      userA,
      `update public.${table} set updated_at=now()`,
      "42501",
    );
    asRole("authenticated", userA, `delete from public.${table}`, "42501");
  }
  asRole(
    "authenticated",
    userA,
    `update public.channels set owner_id='${userB}' where id='${channelA}'`,
    "42501",
  );
});
test("owner can create, edit and delete ideas with automatic timestamps", () => {
  assert.equal(
    asRole(
      "authenticated",
      userA,
      `insert into public.content_ideas (channel_id,title) values ('${channelA}','New idea') returning title`,
    ),
    "New idea",
  );
  assert.equal(
    asRole(
      "authenticated",
      userA,
      `update public.content_ideas set title='Edited',status='shortlisted' where id='${ideaA}' returning title, status, updated_at > '2020-01-01'::timestamptz`,
    ),
    "Edited|shortlisted|t",
  );
  assert.equal(
    asRole(
      "authenticated",
      userA,
      `delete from public.content_ideas where id='${ideaA}' returning id`,
    ),
    ideaA,
  );
});
test("cross-owner idea insert is denied; cross-owner updates/deletes affect no rows", () => {
  asRole(
    "authenticated",
    userA,
    `insert into public.content_ideas (channel_id,title) values ('${channelB}','Intrusion')`,
    "42501",
  );
  asRole(
    "authenticated",
    "",
    `insert into public.content_ideas (channel_id,title) values ('${channelA}','Missing identity')`,
    "42501",
  );
  assert.equal(
    asRole(
      "authenticated",
      userA,
      `update public.content_ideas set title='Intrusion' where id='${ideaB}' returning id`,
    ),
    "",
  );
  assert.equal(
    asRole(
      "authenticated",
      userA,
      `delete from public.content_ideas where id='${ideaB}' returning id`,
    ),
    "",
  );
  asRole(
    "authenticated",
    userA,
    `update public.content_ideas set channel_id='${channelB}' where id='${ideaA}'`,
    "42501",
  );
  asRole(
    "authenticated",
    userA,
    `update public.content_ideas set created_at=now() where id='${ideaA}'`,
    "42501",
  );
});
test("experiments require a linked video for running or completed status", () => {
  asRole("service_role", "", `insert into public.content_experiments (channel_id,title,hypothesis,reporting_window_days,status) values ('${channelA}','Planned','Test a hook',1,'planned')`);
  asRole("service_role", "", `insert into public.content_experiments (channel_id,title,hypothesis,reporting_window_days,status) values ('${channelA}','Running','Test a hook',1,'running')`, "23514");
  asRole("service_role", "", `insert into public.content_experiments (channel_id,title,hypothesis,reporting_window_days,status,video_id,completed_at) values ('${channelA}','Complete','Test a hook',1,'completed','${videoA}',now())`);
  assert.equal(asRole("authenticated", userA, "select count(*) from public.content_experiments"), "1");
  assert.equal(asRole("authenticated", userB, "select count(*) from public.content_experiments"), "1");
});
test("reconciliation preserves a legacy experiment and leaves its window unknown", () => {
  sql("alter table public.content_experiments rename to content_experiments_phase6_fixture");
  sql(`
    create table public.content_experiments (
      id uuid primary key,
      channel_id uuid not null references public.channels (id),
      content_idea_id uuid references public.content_ideas (id),
      script_draft_id uuid references public.script_drafts (id),
      video_id uuid,
      topic text,
      hook_format text,
      hypothesis text,
      status text,
      result_summary text,
      recommendation text,
      observed_views bigint,
      observed_minutes_watched numeric,
      observed_average_view_duration_seconds numeric,
      observed_likes bigint,
      observed_comments bigint,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    create trigger set_updated_at before update on public.content_experiments
      for each row execute function private.set_updated_at();
    insert into public.content_experiments
      (id, channel_id, topic, hook_format, hypothesis, status, result_summary,
       observed_views, created_at, updated_at)
    values
      ('50000000-0000-4000-8000-000000000099', '${channelA}', 'Legacy topic',
       'question', 'Legacy hypothesis', 'completed', 'Historical result',
       42, '2024-01-01 00:00:00+00', '2024-01-02 00:00:00+00');
  `);
  sql(readFileSync("supabase/migrations/20260923231944_reconcile_content_experiments_schema.sql", "utf8"));
  assert.equal(
    sql("select title || '|' || coalesce(reporting_window_days::text, 'NULL') || '|' || observed_views || '|' || created_at::date || '|' || updated_at::date from public.content_experiments"),
    "Legacy topic|NULL|42|2024-01-01|2024-01-02",
  );
  assert.equal(sql("select count(*) from pg_constraint where conrelid='public.content_experiments'::regclass and conname='content_experiments_reporting_window_compatibility_check'"), "1");
  sql("drop table public.content_experiments; alter table public.content_experiments_phase6_fixture rename to content_experiments");
  sql(readFileSync("supabase/migrations/20260923231944_reconcile_content_experiments_schema.sql", "utf8"));
  assert.equal(sql("select count(*) from information_schema.columns where table_schema='public' and table_name='content_experiments' and column_name in ('title','reporting_window_days')"), "2");
});
test("private jobs are inaccessible to both client roles but available to service role", () => {
  for (const role of ["anon", "authenticated"]) {
    for (const query of ["select *", "delete"])
      asRole(role, userA, `${query} from private.analytics_sync_jobs`, "42501");
    asRole(
      role,
      userA,
      "insert into private.analytics_sync_jobs default values",
      "42501",
    );
    asRole(
      role,
      userA,
      "update private.analytics_sync_jobs set status='failed'",
      "42501",
    );
  }
  assert.equal(
    asRole(
      "service_role",
      "",
      "select count(*) from private.analytics_sync_jobs",
    ),
    "2",
  );
});
test("encrypted YouTube connections are private and bound to channel ownership", () => {
  for (const role of ["anon", "authenticated"]) {
    asRole(role, userA, "select * from private.youtube_connections", "42501");
    asRole(role, userA, "delete from private.youtube_connections", "42501");
  }
  const encrypted = "v1." + "x".repeat(60);
  asRole(
    "service_role",
    "",
    `insert into private.youtube_connections (owner_id,channel_id,encrypted_refresh_token,scopes) values ('${userB}','${channelA}','${encrypted}','youtube.readonly')`,
    "23503",
  );
  assert.equal(
    asRole(
      "service_role",
      "",
      `insert into private.youtube_connections (owner_id,channel_id,encrypted_refresh_token,scopes) values ('${userA}','${channelA}','${encrypted}','youtube.readonly'); select count(*) from private.youtube_connections`,
    ),
    "1",
  );
});
test("foreign keys prevent metrics from attaching a video to a different channel", () => {
  asRole(
    "service_role",
    "",
    `insert into public.video_metrics (video_id,channel_id,metric_date) values ('${videoA}','${channelB}','2026-09-02')`,
    "23503",
  );
});
test("natural metric keys support idempotent upserts without duplicate rows", () => {
  assert.equal(
    asRole(
      "service_role",
      "",
      `insert into public.video_metrics (video_id,channel_id,metric_date,views) values ('${videoA}','${channelA}','2026-09-01',150) on conflict (video_id,metric_date) do update set views=excluded.views; select count(*),max(views) from public.video_metrics where video_id='${videoA}'`,
    ),
    "1|150",
  );
  assert.equal(
    asRole(
      "service_role",
      "",
      `insert into public.channel_metrics (channel_id,metric_date,views) values ('${channelA}','2026-09-01',150) on conflict (channel_id,metric_date) do update set views=excluded.views; select count(*),max(views) from public.channel_metrics where channel_id='${channelA}'`,
    ),
    "1|150",
  );
  asRole(
    "service_role",
    "",
    `insert into private.analytics_sync_jobs (channel_id,idempotency_key,period_start,period_end) values ('${channelA}','test-period','2026-09-01','2026-09-01')`,
    "23505",
  );
});
test("server sync storage claims one job and atomically upserts imported data", () => {
  const databaseUrl = `postgresql://postgres@localhost/postgres?host=${encodeURIComponent(root)}&port=5432`;
  const result = spawnSync(join("node_modules", ".bin", "tsx"), ["tests/database-store-check.ts"], {
    env: { ...pgEnv, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
test("unsupported metrics stay NULL; negative and non-finite metric values are rejected", () => {
  assert.equal(
    asRole(
      "authenticated",
      userA,
      "select likes is null, average_view_duration_seconds is null from public.video_metrics",
    ),
    "t|t",
  );
  for (const table of ["video_metrics", "channel_metrics"]) {
    asRole("service_role", "", `update public.${table} set views=-1`, "23514");
    asRole(
      "service_role",
      "",
      `update public.${table} set estimated_minutes_watched='NaN'`,
      "23514",
    );
    asRole(
      "service_role",
      "",
      `update public.${table} set average_view_duration_seconds='Infinity'`,
      "23514",
    );
  }
});
test("insights preserve AI provenance and reject invalid reporting periods", () => {
  asRole(
    "service_role",
    "",
    "update public.marketing_insights set origin='ai', model_identifier='test-model'",
    "23514",
  );
  assert.equal(
    asRole(
      "service_role",
      "",
      `update public.marketing_insights set origin='ai',kind='hypothesis',model_identifier='test-model' where channel_id='${channelA}' returning kind`,
    ),
    "hypothesis",
  );
  asRole(
    "service_role",
    "",
    "update public.marketing_insights set period_end='2020-01-01'",
    "23514",
  );
  asRole(
    "service_role",
    "",
    "update private.analytics_sync_jobs set period_end='2020-01-01'",
    "23514",
  );
});
test("deleting an auth user cascades their data but preserves the other owner's rows", () => {
  const counts = tables
    .map((table) => `select count(*) from public.${table}`)
    .join(";");
  assert.equal(
    sql(
      `begin; delete from auth.users where id='${userA}'; ${counts}; select count(*) from private.analytics_sync_jobs; rollback;`,
    ),
    Array(9).fill("1").join("\n"),
  );
});
test("clipforge projects and content items stay inside the owning account", () => {
  const projectA = "a1000000-0000-4000-8000-000000000001";
  const projectA2 = "a1000000-0000-4000-8000-000000000003";
  const projectB = "a1000000-0000-4000-8000-000000000002";
  const itemA = "b1000000-0000-4000-8000-000000000001";
  const tempItem = "b1000000-0000-4000-8000-000000000099";
  sql(`insert into public.projects (id, owner_id, name, code) values
    ('${projectA}','${userA}','History in 60s','H60'),
    ('${projectA2}','${userA}','Notes','NOTE'),
    ('${projectB}','${userB}','Affiliate','AFF')`);
  sql(`insert into public.content_items (id, project_id, owner_id, content_key, title, topic, format, production_type, status, duration_seconds)
    values ('${itemA}','${projectA}','${userA}','H60-0042','Siege logistics','medieval','short_form','new','editing',58)`);
  assert.equal(asRole("authenticated", userA, `select name from public.projects where id='${projectA}'`), "History in 60s");
  assert.equal(asRole("authenticated", userA, `update public.projects set name='History', description='Short', status='archived' where id='${projectA}' returning status`), "archived");
  assert.equal(asRole("authenticated", userA, `insert into public.projects (owner_id, name, code) values ('${userA}','Chronicles of Suvarnabhumi','COS') returning code`), "COS");
  assert.equal(asRole("authenticated", userB, `select count(*) from public.projects where id='${projectA}'`), "0");
  assert.equal(asRole("authenticated", userB, `update public.projects set name='Stolen' where id='${projectA}' returning id`), "");
  assert.equal(asRole("authenticated", userB, `delete from public.projects where id='${projectA}' returning id`), "");
  assert.equal(sql(`select name from public.projects where id='${projectA}'`), "History in 60s");
  asRole("anon", "", "select * from public.projects", "42501");
  asRole("anon", "", `insert into public.projects (owner_id, name) values ('${userA}','Anon')`, "42501");
  asRole("authenticated", userB, `insert into public.projects (owner_id, name) values ('${userA}','Stolen')`, "42501");
  asRole("authenticated", userA, `insert into public.projects (owner_id, name, status) values ('${userA}','Bad','paused')`, "23514");
  asRole("authenticated", userA, `update public.projects set owner_id='${userB}' where id='${projectA}'`, "42501");
  asRole("authenticated", userA, `update public.projects set created_at=now() where id='${projectA}'`, "42501");
  assert.equal(asRole("authenticated", userA, `select title from public.content_items where id='${itemA}'`), "Siege logistics");
  assert.equal(asRole("authenticated", userA, `insert into public.content_items (project_id, owner_id, title) values ('${projectA}','${userA}','New clip') returning title`), "New clip");
  assert.equal(asRole("authenticated", userA, `update public.content_items set title='Edited siege', status='ready' where id='${itemA}' returning status`), "ready");
  assert.equal(asRole("authenticated", userA, `update public.content_items set project_id='${projectA2}' where id='${itemA}' returning project_id`), projectA2);
  assert.equal(asRole("authenticated", userB, `select count(*) from public.content_items where id='${itemA}'`), "0");
  assert.equal(asRole("authenticated", userB, `update public.content_items set project_id='${projectB}' where id='${itemA}' returning id`), "");
  assert.equal(sql(`select project_id from public.content_items where id='${itemA}'`), projectA);
  asRole("authenticated", userA, `update public.content_items set project_id='${projectB}' where id='${itemA}'`, "42501");
  sql(`update public.content_items set project_id='${projectB}' where id='${itemA}'`, "23503");
  asRole("authenticated", userB, `insert into public.content_items (project_id, owner_id, title) values ('${projectA}','${userB}','Steal')`, "42501");
  asRole("anon", "", "select * from public.content_items", "42501");
  asRole("authenticated", userA, `update public.content_items set status='viral' where id='${itemA}'`, "23514");
  asRole("authenticated", userA, `update public.content_items set owner_id='${userB}' where id='${itemA}'`, "42501");
  assert.equal(sql("select count(*) from pg_trigger where tgname='set_updated_at' and tgrelid in ('public.projects'::regclass, 'public.content_items'::regclass) and not tgisinternal"), "2");
  sql(`insert into public.content_items (id, project_id, owner_id, title) values ('${tempItem}','${projectA}','${userA}','Temporary')`);
  assert.equal(sql(`delete from public.content_items where id='${tempItem}' returning id`), tempItem);
  assert.equal(sql(`select count(*) from public.content_items where id='${tempItem}'`), "0");
  assert.equal(sql(`select count(*) from public.projects where id='${projectA}'`), "1");
  assert.equal(asRole("authenticated", userA, `delete from public.content_items where id='${itemA}' returning id`), itemA);
  assert.equal(sql(`select count(*) from public.content_items where id='${itemA}'`), "1");
  sql(`delete from public.projects where id='${projectA}'`);
  assert.equal(sql(`select count(*) from public.content_items where project_id='${projectA}' or id='${itemA}'`), "0");
  assert.equal(sql(`select count(*) from public.projects where id='${projectB}'`), "1");
});
test("clipforge assets and platform posts stay private to the owning content item", () => {
  const projectA = "c1000000-0000-4000-8000-000000000011";
  const projectB = "c1000000-0000-4000-8000-000000000012";
  const itemA = "d1000000-0000-4000-8000-000000000011";
  const itemB = "d1000000-0000-4000-8000-000000000012";
  const videoPath = `${userA}/${itemA}/master_video/clip-final.mp4`;
  const imagePath = `${userA}/${itemA}/thumbnail/cover.jpg`;
  sql(`insert into public.projects (id, owner_id, name) values
    ('${projectA}','${userA}','Asset project'),
    ('${projectB}','${userB}','Other asset project')`);
  sql(`insert into public.content_items (id, project_id, owner_id, title) values
    ('${itemA}','${projectA}','${userA}','Asset clip'),
    ('${itemB}','${projectB}','${userB}','Other clip')`);
  assert.match(
    sql("select indexdef from pg_indexes where schemaname='public' and indexname='content_items_project_id_owner_id_idx'"),
    /\(project_id, owner_id\)/,
  );
  assert.equal(
    sql("select count(*) from pg_constraint where conname='content_items_id_owner_id_key' and contype='u'"),
    "1",
  );
  assert.equal(
    sql("select count(*) from pg_trigger where tgrelid='public.content_items'::regclass and not tgisinternal and tgname <> 'set_updated_at'"),
    "0",
  );
  assert.equal(
    sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','private','storage')"),
    "0",
  );
  assert.equal(
    sql("select column_default from information_schema.columns where table_schema='public' and table_name='content_assets' and column_name='storage_provider'"),
    "'r2'::text",
  );
  assert.equal(sql("select count(*) from pg_policies where schemaname='storage' and policyname like 'clipforge%'"), "0");
  for (const column of ["owner_id", "content_item_id", "kind", "storage_provider", "storage_bucket", "storage_path", "original_filename", "mime_type", "size_bytes", "created_at", "updated_at"]) {
    assert.equal(sql(`select has_column_privilege('authenticated','public.content_assets','${column}','update')`), "f", column);
  }
  assert.equal(sql("select has_table_privilege('authenticated','public.content_assets','update')"), "f");
  assert.equal(sql("select has_table_privilege('authenticated','public.content_assets','select')"), "t");
  assert.equal(sql("select has_table_privilege('authenticated','public.content_assets','delete')"), "t");
  for (const column of ["content_item_id", "owner_id", "kind", "storage_provider", "storage_bucket", "storage_path", "original_filename", "mime_type", "size_bytes"]) {
    assert.equal(sql(`select has_column_privilege('authenticated','public.content_assets','${column}','insert')`), "t", column);
  }
  assert.equal(sql("select count(*) from pg_policies where schemaname='public' and tablename='content_assets' and cmd='UPDATE'"), "0");
  for (const column of ["owner_id", "content_item_id", "platform", "created_at", "updated_at"]) {
    assert.equal(sql(`select has_column_privilege('authenticated','public.platform_posts','${column}','update')`), "f");
  }
  assert.equal(sql("select has_column_privilege('authenticated','public.platform_posts','status','update')"), "t");
  assert.equal(sql("select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='content_assets'"), "t");
  assert.equal(sql("select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='platform_posts'"), "t");

  sql(`insert into public.content_assets (content_item_id, owner_id, kind, storage_provider, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','master_video','s3','${videoPath}','clip.mp4','video/mp4',1024)`, "23514");
  assert.equal(
    asRole("authenticated", userA, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','master_video','${videoPath}','clip final.mp4','video/mp4',1024) returning kind`),
    "master_video",
  );
  sql(`insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','master_video','${videoPath}','clip final.mp4','video/mp4',1024)`);
  asRole("authenticated", userA, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','master_video','${userA}/${itemA}/master_video/second.mp4','second.mp4','video/mp4',1024)`, "23505");
  asRole("authenticated", userA, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','thumbnail','${imagePath}','cover.jpg','image/jpeg',536870913)`, "23514");
  asRole("authenticated", userA, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','thumbnail','${userA}/${itemA}/thumbnail/bad.jpg','bad.jpg','image/gif',2048)`, "23514");
  asRole("authenticated", userA, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','thumbnail','${userA}/${itemA}/thumbnail/../bad.jpg','bad.jpg','image/jpeg',2048)`, "23514");
  assert.equal(
    asRole("authenticated", userA, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','thumbnail','${imagePath}','cover.jpg','image/jpeg',2048) returning kind`),
    "thumbnail",
  );
  sql(`insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','thumbnail','${imagePath}','cover.jpg','image/jpeg',2048)`);
  asRole("authenticated", userA, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userA}','thumbnail','${userA}/${itemA}/thumbnail/two.jpg','two.jpg','image/png',2048)`, "23505");
  assert.equal(asRole("authenticated", userB, `select count(*) from public.content_assets where content_item_id='${itemA}'`), "0");
  asRole("authenticated", userB, `insert into public.content_assets (content_item_id, owner_id, kind, storage_path, original_filename, mime_type, size_bytes) values ('${itemA}','${userB}','master_video','${userB}/${itemA}/master_video/steal.mp4','steal.mp4','video/mp4',1024)`, "42501");
  asRole("anon", "", "select * from public.content_assets", "42501");
  asRole("authenticated", userA, `update public.content_assets set owner_id='${userB}' where content_item_id='${itemA}'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set storage_path='${userA}/${itemB}/master_video/clip-final.mp4' where content_item_id='${itemA}'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set kind='thumbnail' where content_item_id='${itemA}' and kind='master_video'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set storage_bucket='public' where content_item_id='${itemA}'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set created_at=now() where content_item_id='${itemA}'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set updated_at=now() where content_item_id='${itemA}'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set original_filename='renamed.mp4' where content_item_id='${itemA}' and kind='master_video'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set mime_type='video/quicktime' where content_item_id='${itemA}' and kind='master_video'`, "42501");
  asRole("authenticated", userA, `update public.content_assets set size_bytes=2048 where content_item_id='${itemA}' and kind='master_video'`, "42501");
  assert.equal(sql(`select original_filename from public.content_assets where content_item_id='${itemA}' and kind='master_video'`), "clip final.mp4");
  assert.equal(sql(`select mime_type from public.content_assets where content_item_id='${itemA}' and kind='master_video'`), "video/mp4");
  assert.equal(sql(`select size_bytes from public.content_assets where content_item_id='${itemA}' and kind='master_video'`), "1024");
  sql(`update public.content_assets set owner_id='${userB}' where content_item_id='${itemA}' and kind='master_video'`, "23514");

  for (const platform of ["youtube", "facebook", "tiktok", "instagram"]) {
    assert.equal(
      asRole("authenticated", userA, `insert into public.platform_posts (content_item_id, owner_id, platform) values ('${itemA}','${userA}','${platform}') returning platform`),
      platform,
    );
  }
  sql(`insert into public.platform_posts (content_item_id, owner_id, platform) values
    ('${itemA}','${userA}','youtube'),
    ('${itemA}','${userA}','facebook'),
    ('${itemA}','${userA}','tiktok'),
    ('${itemA}','${userA}','instagram')`);
  asRole("authenticated", userA, `insert into public.platform_posts (content_item_id, owner_id, platform) values ('${itemA}','${userA}','youtube')`, "23505");
  asRole("authenticated", userA, `insert into public.platform_posts (content_item_id, owner_id, platform) values ('${itemA}','${userA}','x')`, "23514");
  asRole("authenticated", userA, `update public.platform_posts set status='viral' where content_item_id='${itemA}' and platform='youtube'`, "23514");
  asRole("authenticated", userA, `update public.platform_posts set status='scheduled' where content_item_id='${itemA}' and platform='youtube'`, "23514");
  assert.equal(asRole("authenticated", userA, `update public.platform_posts set status='published' where content_item_id='${itemA}' and platform='facebook' returning (published_at is null)`), "t");
  asRole("authenticated", userA, `update public.platform_posts set post_url='http://example.com/post' where content_item_id='${itemA}' and platform='tiktok'`, "23514");
  asRole("authenticated", userA, `update public.platform_posts set platform_post_id='has space' where content_item_id='${itemA}' and platform='instagram'`, "23514");
  assert.equal(asRole("authenticated", userA, `update public.platform_posts set status='scheduled', scheduled_at=now() where content_item_id='${itemA}' and platform='youtube' returning status`), "scheduled");
  assert.equal(asRole("authenticated", userA, `update public.platform_posts set status='published', published_at=now(), post_url='https://youtu.be/abc123' where content_item_id='${itemA}' and platform='facebook' returning post_url`), "https://youtu.be/abc123");
  assert.equal(asRole("authenticated", userA, `update public.platform_posts set status='skipped' where content_item_id='${itemA}' and platform='tiktok' returning status`), "skipped");
  assert.equal(asRole("authenticated", userB, `select count(*) from public.platform_posts where content_item_id='${itemA}'`), "0");
  assert.equal(asRole("authenticated", userB, `update public.platform_posts set title='Stolen' where content_item_id='${itemA}' returning id`), "");
  asRole("authenticated", userB, `insert into public.platform_posts (content_item_id, owner_id, platform) values ('${itemA}','${userB}','youtube')`, "42501");
  asRole("anon", "", "select * from public.platform_posts", "42501");
  asRole("authenticated", userA, `update public.platform_posts set owner_id='${userB}' where content_item_id='${itemA}'`, "42501");
  asRole("authenticated", userA, `update public.platform_posts set platform='tiktok' where content_item_id='${itemA}' and platform='instagram'`, "42501");
  asRole("authenticated", userA, `update public.platform_posts set created_at=now() where content_item_id='${itemA}'`, "42501");
  asRole("authenticated", userA, `update public.platform_posts set updated_at=now() where content_item_id='${itemA}'`, "42501");
  assert.equal(asRole("authenticated", userA, `update public.platform_posts set title='Ready title' where content_item_id='${itemA}' and platform='instagram' returning title`), "Ready title");
  asRole("authenticated", userA, `update public.content_items set owner_id='${userB}' where id='${itemA}'`, "42501");
  sql(`update public.content_items set owner_id='${userB}' where id='${itemA}'`, "23503");

  sql(`delete from public.content_items where id='${itemA}'`);
  assert.equal(sql(`select count(*) from public.content_assets where content_item_id='${itemA}'`), "0");
  assert.equal(sql(`select count(*) from public.platform_posts where content_item_id='${itemA}'`), "0");
  assert.equal(sql(`select count(*) from public.content_items where id='${itemB}'`), "1");
  sql(`delete from public.projects where id in ('${projectA}','${projectB}')`);
});
test("password setup authorizations stay server-only and reject invalid grants", () => {
  const recovery = "ab".repeat(32);
  const invite = "34".repeat(32);
  const session = "c1000000-0000-4000-8000-000000000001";
  for (const role of ["anon", "authenticated", "service_role"]) {
    asRole(role, userA, "select * from private.password_setup_authorizations", "42501");
    asRole(
      role,
      userA,
      `insert into private.password_setup_authorizations (token_hash, owner_id, session_id, flow) values ('${recovery}','${userA}','${session}','recovery')`,
      "42501",
    );
    asRole(role, userA, "update private.password_setup_authorizations set consumed_at=now()", "42501");
    asRole(role, userA, "delete from private.password_setup_authorizations", "42501");
    for (const privilege of ["select", "insert", "update", "delete"]) {
      assert.equal(
        sql(`select has_table_privilege('${role}','private.password_setup_authorizations','${privilege}')`),
        "f",
      );
    }
  }
  assert.equal(
    sql("select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='password_setup_authorizations'"),
    "t",
  );
  assert.equal(
    sql("select count(*) from pg_policies where schemaname='private' and tablename='password_setup_authorizations'"),
    "0",
  );
  assert.equal(
    sql(`insert into private.password_setup_authorizations (token_hash, owner_id, session_id, flow) values ('${recovery}','${userA}','${session}','recovery') returning (expires_at > created_at and expires_at <= created_at + interval '10 minutes')`),
    "t",
  );
  sql(
    `insert into private.password_setup_authorizations (token_hash, owner_id, session_id, flow) values ('${"cd".repeat(32)}','${userA}','${session}','reset')`,
    "23514",
  );
  sql(
    `insert into private.password_setup_authorizations (token_hash, owner_id, session_id, flow) values ('not-a-hash','${userA}','${session}','invite')`,
    "23514",
  );
  sql(
    `insert into private.password_setup_authorizations (token_hash, owner_id, session_id, flow, created_at, expires_at) values ('${"ef".repeat(32)}','${userA}','${session}','invite', now(), now())`,
    "23514",
  );
  sql(
    `insert into private.password_setup_authorizations (token_hash, owner_id, session_id, flow, created_at, expires_at) values ('${"12".repeat(32)}','${userA}','${session}','invite', now(), now() + interval '11 minutes')`,
    "23514",
  );
  sql(`insert into private.password_setup_authorizations (token_hash, owner_id, session_id, flow) values ('${invite}','${userB}','${session}','invite')`);
  assert.equal(
    sql(`begin; delete from auth.users where id='${userA}'; select count(*) from private.password_setup_authorizations where owner_id='${userA}'; select count(*) from private.password_setup_authorizations where token_hash='${invite}'; rollback;`),
    "0\n1",
  );
  assert.equal(
    sql(`update private.password_setup_authorizations set consumed_at=now() where token_hash='${recovery}' and owner_id='${userA}' and session_id='${session}' and flow='recovery' and consumed_at is null and expires_at > now() returning token_hash`),
    recovery,
  );
  assert.equal(
    sql(`update private.password_setup_authorizations set consumed_at=now() where token_hash='${recovery}' and consumed_at is null returning token_hash`),
    "",
  );
  sql(`delete from private.password_setup_authorizations where token_hash in ('${recovery}','${invite}')`);
  assert.equal(sql("select count(*) from private.password_setup_authorizations"), "0");
});

function importFields(project, owner) {
  const parts = sql(bindImportSql(youtubeImportSql, project, owner)).split("|");
  assert.equal(parts.length, 7);
  return parts;
}

test("legacy YouTube import is idempotent and does not cross owners", () => {
  const ownerA = "11000000-0000-4000-8000-0000000000aa";
  const ownerB = "11000000-0000-4000-8000-0000000000bb";
  const channelA = "21000000-0000-4000-8000-0000000000aa";
  const channelA2 = "21000000-0000-4000-8000-0000000000a2";
  const channelB = "21000000-0000-4000-8000-0000000000bb";
  const projectA = "a2000000-0000-4000-8000-0000000000aa";
  const projectB = "a2000000-0000-4000-8000-0000000000bb";
  const longTitle = "T".repeat(250);
  assert.match(
    sql("select indexdef from pg_indexes where schemaname='public' and indexname='platform_posts_owner_platform_post_id_idx'"),
    /owner_id, platform, platform_post_id[\s\S]*platform_post_id IS NOT NULL/,
  );
  sql(`insert into auth.users (id) values ('${ownerA}'), ('${ownerB}')`);
  sql(`insert into public.users (id) values ('${ownerA}'), ('${ownerB}')`);
  sql(`insert into public.channels (id, owner_id, youtube_channel_id, title) values
    ('${channelA}','${ownerA}','legacy-channel-a','History in 60s'),
    ('${channelA2}','${ownerA}','legacy-channel-a2','Second channel'),
    ('${channelB}','${ownerB}','legacy-channel-b','Other channel')`);
  sql(`insert into public.projects (id, owner_id, name) values
    ('${projectA}','${ownerA}','History in 60s'),
    ('${projectB}','${ownerB}','Other project')`);
  sql(`insert into public.videos (channel_id, youtube_video_id, title, topic, published_at, duration_seconds) values
    ('${channelA}','aaaaaaaaaaa','Siege logistics','medieval','2024-06-01T00:00:00Z',58),
    ('${channelA}','bbbbbbbbbbb','Same title',null,null,120),
    ('${channelA}','ccccccccccc','Same title','other','2024-07-01T00:00:00Z',59.5),
    ('${channelA}','ddddddddddd','${longTitle}',null,null,10),
    ('${channelA}','short','Too short an id',null,null,10),
    ('${channelA2}','aaaaaaaaaaa','Duplicate row',null,null,10),
    ('${channelB}','eeeeeeeeeee','Foreign clip','secret',null,40)`);
  const preview = sql(bindImportSql(youtubePreviewSql, projectA, ownerA)).split("|");
  assert.equal(preview.length, 6);
  assert.equal(preview[0], "History in 60s");
  assert.match(preview[1], /History in 60s/);
  assert.match(preview[1], /Second channel/);
  assert.deepEqual(preview.slice(2), ["6", "3", "0", "3"]);
  assert.equal(sql(bindImportSql(youtubePreviewSql, projectB, ownerA)), "");
  const first = importFields(projectA, ownerA);
  assert.deepEqual(first, ["t", "6", "3", "12", "0", "0", "3"]);
  const linkedPreview = sql(bindImportSql(youtubePreviewSql, projectA, ownerA)).split("|");
  assert.deepEqual(linkedPreview.slice(2), ["6", "0", "3", "3"]);
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerA}'`), "3");
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerA}' and language_code='und'`), "3");
  assert.equal(sql(`select count(*) from public.platform_posts where owner_id='${ownerA}'`), "12");
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerA}' and title='Same title'`), "2");
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerA}' and title='Foreign clip'`), "0");
  const siege = sql(`select i.id from public.content_items i join public.platform_posts p on p.content_item_id=i.id where p.owner_id='${ownerA}' and p.platform='youtube' and p.platform_post_id='aaaaaaaaaaa'`);
  assert.match(siege, /^[0-9a-f-]{36}$/);
  assert.equal(
    sql(`select format || '|' || production_type || '|' || status || '|' || language_code || '|' || (content_key is null) || '|' || topic || '|' || duration_seconds || '|' || (notes = '') from public.content_items where id='${siege}'`),
    "unknown|unknown|published|und|true|medieval|58|true",
  );
  assert.equal(
    sql(`select status || '|' || platform_post_id || '|' || post_url || '|' || (published_at = '2024-06-01T00:00:00Z') || '|' || (scheduled_at is null) || '|' || title from public.platform_posts where content_item_id='${siege}' and platform='youtube'`),
    "published|aaaaaaaaaaa|https://www.youtube.com/watch?v=aaaaaaaaaaa|true|true|Siege logistics",
  );
  const undated = sql(`select i.id from public.content_items i join public.platform_posts p on p.content_item_id=i.id where p.owner_id='${ownerA}' and p.platform_post_id='bbbbbbbbbbb'`);
  assert.equal(
    sql(`select p.status || '|' || (p.published_at is null) || '|' || (p.scheduled_at is null) || '|' || i.topic || '|' || i.duration_seconds from public.platform_posts p join public.content_items i on i.id=p.content_item_id where p.content_item_id='${undated}' and p.platform='youtube'`),
    "published|true|true||120",
  );
  assert.equal(sql(`select format from public.content_items where id='${undated}'`), "unknown");
  const fractional = sql(`select duration_seconds is null from public.content_items i join public.platform_posts p on p.content_item_id=i.id where p.platform_post_id='ccccccccccc'`);
  assert.equal(fractional, "t");
  for (const platform of ["facebook", "tiktok", "instagram"]) {
    assert.equal(
      sql(`select status || '|' || (platform_post_id is null) || '|' || (post_url is null) || '|' || (published_at is null) || '|' || (scheduled_at is null) || '|' || title || '|' || caption from public.platform_posts where content_item_id='${siege}' and platform='${platform}'`),
      "not_started|true|true|true|true||",
    );
  }
  assert.equal(sql(`select count(*) from public.content_items where project_id='${projectB}'`), "0");
  const foreign = importFields(projectB, ownerA);
  assert.equal(foreign[0], "f");
  assert.equal(sql(`select count(*) from public.content_items where project_id='${projectB}'`), "0");
  const second = importFields(projectA, ownerA);
  assert.deepEqual(second, ["t", "6", "0", "0", "3", "0", "3"]);
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerA}'`), "3");
  assert.equal(sql(`select count(*) from public.platform_posts where owner_id='${ownerA}'`), "12");
  sql(`update public.content_items set title='Curated siege', topic='owner topic', notes='keep me', production_type='remaster', format='short_form', language_code='th' where id='${siege}'`);
  sql(`update public.platform_posts set caption='human caption', title='Hand edited platform title' where content_item_id='${siege}' and platform='youtube'`);
  sql(`update public.videos set title='Source title changed', topic='source topic', duration_seconds=61, published_at='2024-08-01T00:00:00Z' where channel_id='${channelA}' and youtube_video_id='aaaaaaaaaaa'`);
  const refreshed = importFields(projectA, ownerA);
  assert.deepEqual(refreshed, ["t", "6", "0", "0", "3", "1", "3"]);
  assert.equal(
    sql(`select title || '|' || topic || '|' || notes || '|' || production_type || '|' || format || '|' || language_code || '|' || duration_seconds from public.content_items where id='${siege}'`),
    "Curated siege|owner topic|keep me|remaster|short_form|th|61",
  );
  assert.equal(
    sql(`select title || '|' || caption || '|' || post_url || '|' || (published_at = '2024-08-01T00:00:00Z') from public.platform_posts where content_item_id='${siege}' and platform='youtube'`),
    "Source title changed|human caption|https://www.youtube.com/watch?v=aaaaaaaaaaa|true",
  );
  const ownedAgain = "b2000000-0000-4000-8000-0000000000aa";
  sql(`insert into public.content_items (id, project_id, owner_id, title) values ('${ownedAgain}','${projectA}','${ownerA}','Manual duplicate')`);
  assert.equal(sql(`select language_code from public.content_items where id='${ownedAgain}'`), "und");
  sql(`update public.content_items set language_code='eng' where id='${ownedAgain}'`, "23514");
  sql(`update public.content_items set language_code='en-US' where id='${ownedAgain}'`);
  sql(`update public.content_items set language_code='en' where id='${ownedAgain}'`);
  sql(`insert into public.platform_posts (content_item_id, owner_id, platform, platform_post_id) values ('${ownedAgain}','${ownerA}','youtube','aaaaaaaaaaa')`, "23505");
  sql(`update public.platform_posts set status='scheduled' where content_item_id='${undated}' and platform='youtube'`, "23514");
  const other = importFields(projectB, ownerB);
  assert.deepEqual(other.slice(0, 4), ["t", "1", "1", "4"]);
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerB}' and title='Foreign clip'`), "1");
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerB}' and title='Siege logistics'`), "0");
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${ownerA}'`), "4");
});

test("legacy YouTube import of 1000 videos does not duplicate on the second run", () => {
  const owner = "11000000-0000-4000-8000-0000000000cc";
  const channel = "21000000-0000-4000-8000-0000000000cc";
  const project = "a2000000-0000-4000-8000-0000000000cc";
  sql(`insert into auth.users (id) values ('${owner}')`);
  sql(`insert into public.users (id) values ('${owner}')`);
  sql(`insert into public.channels (id, owner_id, youtube_channel_id, title) values ('${channel}','${owner}','legacy-scale','Scale channel')`);
  sql(`insert into public.projects (id, owner_id, name) values ('${project}','${owner}','Scale project')`);
  sql(`insert into public.videos (channel_id, youtube_video_id, title, topic, published_at, duration_seconds)
       select '${channel}', 'yt' || lpad(i::text, 9, '0'), 'Legacy clip ' || i,
              case when i % 2 = 0 then 'topic ' || i else null end,
              case when i % 5 = 0 then null else timestamptz '2020-01-01' + (i || ' minutes')::interval end,
              case when i % 7 = 0 then null else 58 end
         from generate_series(1, 1000) as i`);
  const started = Date.now();
  const first = importFields(project, owner);
  const elapsed = Date.now() - started;
  console.log(`YOUTUBE_IMPORT_1000_MS ${elapsed}`);
  assert.deepEqual(first, ["t", "1000", "1000", "4000", "0", "0", "0"]);
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${owner}'`), "1000");
  assert.equal(sql(`select count(*) from public.platform_posts where owner_id='${owner}'`), "4000");
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${owner}' and format='unknown' and production_type='unknown' and content_key is null and status='published' and language_code='und'`), "1000");
  assert.equal(sql(`select count(distinct platform_post_id) from public.platform_posts where owner_id='${owner}' and platform='youtube'`), "1000");
  const second = importFields(project, owner);
  assert.deepEqual(second, ["t", "1000", "0", "0", "1000", "0", "0"]);
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${owner}'`), "1000");
  assert.equal(sql(`select count(*) from public.platform_posts where owner_id='${owner}'`), "4000");
  assert.ok(elapsed < 15000, `import took ${elapsed}ms`);
});

test("YouTube source metadata constraints stay server-owned and are not security definer", () => {
  assert.equal(
    sql("select count(*) from information_schema.columns where table_schema='public' and table_name='videos' and column_name in ('description','thumbnail_url','tags','category_id','default_language','default_audio_language','privacy_status','metadata_synced_at')"),
    "8",
  );
  assert.equal(
    sql("select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='youtube_tags_are_source_bounded'"),
    "f",
  );
  assert.equal(
    sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','private')"),
    "0",
  );
  assert.equal(
    sql(`select exists (
      select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(p.proacl) a
       where n.nspname = 'private'
         and p.proname = 'youtube_tags_are_source_bounded'
         and a.grantee = 0
         and a.privilege_type = 'EXECUTE'
    )::text`),
    "false",
  );
  assert.equal(
    sql(`select has_function_privilege('anon','private.youtube_tags_are_source_bounded(text[])','execute')::text
      || '|' || has_function_privilege('authenticated','private.youtube_tags_are_source_bounded(text[])','execute')::text
      || '|' || has_function_privilege('service_role','private.youtube_tags_are_source_bounded(text[])','execute')::text`),
    "false|false|true",
  );
  assert.equal(
    sql(`select (description = '') and (tags = '{}') and (metadata_synced_at is null) from public.videos where id='${videoA}'`),
    "t",
  );
  asRole("authenticated", userA, `update public.videos set description='hacked' where id='${videoA}'`, "42501");
  asRole("authenticated", userA, `update public.videos set tags=array['hack'] where id='${videoA}'`, "42501");
  asRole("authenticated", userA, `update public.videos set metadata_synced_at=now() where id='${videoA}'`, "42501");
  assert.equal(
    asRole(
      "service_role",
      "",
      `update public.videos set topic='keep topic' where id='${videoA}';
       update public.videos set description='Exact source', thumbnail_url='https://i.ytimg.com/vi/test/maxres.jpg', tags=array['siege','logistics'], category_id='27', default_language='EN', default_audio_language='en-US', privacy_status='unlisted', metadata_synced_at=now() where id='${videoA}';
       select topic || '|' || description || '|' || default_language || '|' || default_audio_language || '|' || privacy_status || '|' || category_id || '|' || case when metadata_synced_at is not null then 'synced' else 'missing' end || '|' || thumbnail_url from public.videos where id='${videoA}'`,
    ),
    "keep topic|Exact source|EN|en-US|unlisted|27|synced|https://i.ytimg.com/vi/test/maxres.jpg",
  );
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, thumbnail_url) values ('${channelA}','badsource01','Bad','http://example.com/a.jpg')`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, thumbnail_url) values ('${channelA}','badsource02','Bad','https://example.com/a b.jpg')`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, privacy_status) values ('${channelA}','badsource03','Bad','friends')`, "23514");
  const thirtyOne = Array.from({ length: 31 }, (_, index) => `'t${index}'`).join(",");
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','goodtags001','Good', array[${thirtyOne}]) returning tags[1] || '|' || tags[2] || '|' || tags[31] || '|' || cardinality(tags)::text`),
    "t0|t1|t30|31",
  );
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','goodtags002','Good', array['Siege','  raw  ','World War']) returning tags[1] || '|' || tags[2] || '|' || tags[3]`),
    "Siege|  raw  |World War",
  );
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','goodtags003','Good', array[repeat('a', 500)]) returning length(tags[1])::text`),
    "500",
  );
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','goodtags004','Good', array['x ' || repeat('y', 496)]) returning length(tags[1])::text`),
    "498",
  );
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','goodtags005','Good', array[repeat('c', 249), repeat('d', 250)]) returning (length(tags[1]) + length(tags[2]) + 1)::text`),
    "500",
  );
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','goodtags006','Good', array[repeat('i', 101)]) returning length(tags[1])::text`),
    "101",
  );
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','goodtags007','Good', array[repeat('👍', 500)]) returning length(tags[1])::text`),
    "500",
  );
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','badsource04','Bad', array[repeat('e', 501)])`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','badsource05','Bad', array['x ' || repeat('z', 497)])`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','badsource11','Bad', array[repeat('g', 250), repeat('h', 250)])`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','badsource12','Bad', array[''])`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','badsource13','Bad', array['ok', null]::text[])`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, tags) values ('${channelA}','badsource14','Bad', array[repeat('👍', 501)])`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, description) values ('${channelA}','badsource06','Bad','${"d".repeat(5001)}')`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, category_id) values ('${channelA}','badsource07','Bad','abc')`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, default_language) values ('${channelA}','badsource08','Bad','en-')`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, default_audio_language) values ('${channelA}','badsource09','Bad','zh-123456789')`, "23514");
  asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, default_language) values ('${channelA}','badsource10','Bad','${"abcdefgh-".repeat(8)}ab')`, "23514");
  assert.equal(
    asRole("service_role", "", `insert into public.videos (channel_id, youtube_video_id, title, default_language, default_audio_language) values ('${channelA}','goodlang001','Good','zh-Hans-CN','es-419') returning default_language || '|' || default_audio_language`),
    "zh-Hans-CN|es-419",
  );
});

test("import copies a safe YouTube language only onto und and leaves editorial fields", () => {
  const owner = "11000000-0000-4000-8000-0000000000dd";
  const channel = "21000000-0000-4000-8000-0000000000dd";
  const project = "a2000000-0000-4000-8000-0000000000dd";
  sql(`insert into auth.users (id) values ('${owner}')`);
  sql(`insert into public.users (id) values ('${owner}')`);
  sql(`insert into public.channels (id, owner_id, youtube_channel_id, title) values ('${channel}','${owner}','source-meta','Source channel')`);
  sql(`insert into public.projects (id, owner_id, name) values ('${project}','${owner}','Source project')`);
  sql(`insert into public.videos (
         channel_id, youtube_video_id, title, topic, published_at, duration_seconds,
         description, tags, category_id, default_language, default_audio_language, privacy_status
       ) values
       ('${channel}','thaudio0001','Audio wins','seed','2024-01-01T00:00:00Z',58,'','{}',null,'en','th','public'),
       ('${channel}','enonly00001','English only','seed','2024-01-02T00:00:00Z',58,'','{}',null,'en',null,'public'),
       ('${channel}','enuslang001','Region tag','seed','2024-01-03T00:00:00Z',58,'','{}',null,'en-US',null,'public'),
       ('${channel}','nolang00001','No language','seed','2024-01-04T00:00:00Z',58,'','{}',null,null,null,null),
       ('${channel}','undaudio001','Und audio','seed','2024-01-05T00:00:00Z',58,'','{}',null,'en','und','public'),
       ('${channel}','bothund0001','Both und','seed','2024-01-06T00:00:00Z',58,'','{}',null,'und','und','public'),
       ('${channel}','upperen0001','Upper EN','seed','2024-01-07T00:00:00Z',58,'','{}',null,'EN',null,'public'),
       ('${channel}','threelang01','Three letter','seed','2024-01-08T00:00:00Z',58,'','{}',null,'eng',null,'public'),
       ('${channel}','humankeep01','Human keep','seed topic','2024-01-09T00:00:00Z',58,'Source description','{alpha,beta}','22','en',null,'unlisted')`);
  const first = importFields(project, owner);
  assert.deepEqual(first, ["t", "9", "9", "36", "0", "0", "0"]);
  const language = (videoId) => sql(`select i.language_code from public.content_items i join public.platform_posts p on p.content_item_id=i.id where p.owner_id='${owner}' and p.platform='youtube' and p.platform_post_id='${videoId}'`);
  assert.equal(language("thaudio0001"), "th");
  assert.equal(language("enonly00001"), "en");
  assert.equal(language("enuslang001"), "en-US");
  assert.equal(language("nolang00001"), "und");
  assert.equal(language("undaudio001"), "en");
  assert.equal(language("bothund0001"), "und");
  assert.equal(language("upperen0001"), "und");
  assert.equal(language("threelang01"), "und");
  assert.equal(language("humankeep01"), "en");
  assert.equal(sql(`select default_language from public.videos where channel_id='${channel}' and youtube_video_id='upperen0001'`), "EN");
  assert.equal(sql(`select default_language from public.videos where channel_id='${channel}' and youtube_video_id='threelang01'`), "eng");
  assert.equal(
    sql(`select caption || '|' || hashtags || '|' || topic from public.platform_posts p join public.content_items i on i.id=p.content_item_id where p.owner_id='${owner}' and p.platform='youtube' and p.platform_post_id='humankeep01'`),
    "||seed topic",
  );
  sql(`update public.content_items i set title='Curated keep', language_code='th', topic='owner topic', format='short_form', production_type='remaster', notes='keep me' from public.platform_posts p where p.content_item_id=i.id and p.owner_id='${owner}' and p.platform='youtube' and p.platform_post_id='humankeep01'`);
  sql(`update public.platform_posts set caption='human caption', hashtags='owner tags' where owner_id='${owner}' and platform='youtube' and platform_post_id='humankeep01'`);
  sql(`update public.videos set description='Changed source description', tags=array['gamma','delta'], category_id='27', topic='source topic', title='Source title changed' where channel_id='${channel}' and youtube_video_id='humankeep01'`);
  sql(`update public.videos set default_audio_language='th' where channel_id='${channel}' and youtube_video_id='nolang00001'`);
  const refreshed = importFields(project, owner);
  assert.deepEqual(refreshed, ["t", "9", "0", "0", "9", "2", "0"]);
  assert.equal(language("nolang00001"), "th");
  assert.equal(language("humankeep01"), "th");
  assert.equal(language("upperen0001"), "und");
  assert.equal(
    sql(`select i.title || '|' || i.topic || '|' || i.notes || '|' || i.format || '|' || i.production_type || '|' || i.language_code || '|' || p.caption || '|' || p.hashtags || '|' || p.title from public.content_items i join public.platform_posts p on p.content_item_id=i.id where p.owner_id='${owner}' and p.platform='youtube' and p.platform_post_id='humankeep01'`),
    "Curated keep|owner topic|keep me|short_form|remaster|th|human caption|owner tags|Source title changed",
  );
  assert.equal(
    sql(`select description || '|' || category_id || '|' || array_to_string(tags, ',') from public.videos where channel_id='${channel}' and youtube_video_id='humankeep01'`),
    "Changed source description|27|gamma,delta",
  );
  const again = importFields(project, owner);
  assert.deepEqual(again, ["t", "9", "0", "0", "9", "0", "0"]);
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${owner}'`), "9");
  assert.equal(sql(`select count(*) from public.platform_posts where owner_id='${owner}'`), "36");
  assert.equal(
    sql(`select count(*) from (select platform_post_id from public.platform_posts where owner_id='${owner}' and platform='youtube' group by platform_post_id having count(*) > 1) duplicates`),
    "0",
  );
});

test("multi-subtag YouTube languages stay raw and only a safe tag fills und", () => {
  const owner = "11000000-0000-4000-8000-0000000000de";
  const channel = "21000000-0000-4000-8000-0000000000de";
  const project = "a2000000-0000-4000-8000-0000000000de";
  sql(`insert into auth.users (id) values ('${owner}')`);
  sql(`insert into public.users (id) values ('${owner}')`);
  sql(`insert into public.channels (id, owner_id, youtube_channel_id, title) values ('${channel}','${owner}','source-lang','Language channel')`);
  sql(`insert into public.projects (id, owner_id, name) values ('${project}','${owner}','Language project')`);
  sql(`insert into public.videos (channel_id, youtube_video_id, title, published_at, duration_seconds, default_language) values
    ('${channel}','zhhans00001','Script tag','2024-02-01T00:00:00Z',58,'zh-Hans'),
    ('${channel}','zhhanscn001','Region tag','2024-02-02T00:00:00Z',58,'zh-Hans-CN'),
    ('${channel}','es419lang01','Numeric region','2024-02-03T00:00:00Z',58,'es-419')`);
  assert.deepEqual(importFields(project, owner), ["t", "3", "3", "12", "0", "0", "0"]);
  const language = (videoId) => sql(`select i.language_code || '|' || v.default_language from public.content_items i join public.platform_posts p on p.content_item_id=i.id join public.videos v on v.youtube_video_id=p.platform_post_id where p.owner_id='${owner}' and p.platform='youtube' and p.platform_post_id='${videoId}'`);
  assert.equal(language("zhhans00001"), "zh-Hans|zh-Hans");
  assert.equal(language("zhhanscn001"), "und|zh-Hans-CN");
  assert.equal(language("es419lang01"), "es-419|es-419");
  const again = importFields(project, owner);
  assert.deepEqual(again, ["t", "3", "0", "0", "3", "0", "0"]);
});

test("source tags stay exact and never become platform hashtags", () => {
  const owner = "11000000-0000-4000-8000-0000000000df";
  const channel = "21000000-0000-4000-8000-0000000000df";
  const project = "a2000000-0000-4000-8000-0000000000df";
  sql(`insert into auth.users (id) values ('${owner}')`);
  sql(`insert into public.users (id) values ('${owner}')`);
  sql(`insert into public.channels (id, owner_id, youtube_channel_id, title) values ('${channel}','${owner}','source-tags','Tag channel')`);
  sql(`insert into public.projects (id, owner_id, name) values ('${project}','${owner}','Tag project')`);
  sql(`insert into public.videos (channel_id, youtube_video_id, title, published_at, duration_seconds, tags) values ('${channel}','taghash0001','Tagged source','2024-03-01T00:00:00Z',58, array['#History','World War','Siege'])`);
  assert.deepEqual(importFields(project, owner), ["t", "1", "1", "4", "0", "0", "0"]);
  assert.equal(
    sql(`select hashtags from public.platform_posts where owner_id='${owner}' and platform='youtube' and platform_post_id='taghash0001'`),
    "",
  );
  assert.equal(
    sql(`select tags[1] || '|' || tags[2] || '|' || tags[3] from public.videos where channel_id='${channel}' and youtube_video_id='taghash0001'`),
    "#History|World War|Siege",
  );
  assert.deepEqual(importFields(project, owner), ["t", "1", "0", "0", "1", "0", "0"]);
  assert.equal(sql(`select count(*) from public.content_items where owner_id='${owner}'`), "1");
  assert.equal(
    sql(`select hashtags from public.platform_posts where owner_id='${owner}' and platform='youtube' and platform_post_id='taghash0001'`),
    "",
  );
});

test("classification suggestions stay owner-readable and change canonical metadata only in an explicit review", () => {
  const owner = "11000000-0000-4000-8000-0000000000e1";
  const other = "11000000-0000-4000-8000-0000000000e2";
  const project = "a2000000-0000-4000-8000-0000000000e1";
  const item = "b2000000-0000-4000-8000-0000000000e1";
  const suggestion = "c2000000-0000-4000-8000-0000000000e1";
  const rejected = "c2000000-0000-4000-8000-0000000000e2";
  const fingerprint = "a".repeat(64);
  const otherFingerprint = "b".repeat(64);
  assert.equal(
    sql("select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='content_classification_suggestions'"),
    "t",
  );
  assert.equal(
    sql("select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='classification_accepted_fields_are_bounded'"),
    "f",
  );
  assert.equal(
    sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','private')"),
    "0",
  );
  assert.equal(
    sql("select count(*) from pg_policies where schemaname='public' and tablename='content_classification_suggestions' and cmd <> 'SELECT'"),
    "0",
  );
  assert.equal(sql("select has_table_privilege('authenticated','public.content_classification_suggestions','select')"), "t");
  assert.equal(sql("select has_table_privilege('authenticated','public.content_classification_suggestions','insert')"), "f");
  assert.equal(sql("select has_table_privilege('authenticated','public.content_classification_suggestions','update')"), "f");
  assert.equal(sql("select has_table_privilege('authenticated','public.content_classification_suggestions','delete')"), "f");
  assert.equal(sql("select has_table_privilege('anon','public.content_classification_suggestions','select')"), "f");
  assert.equal(sql("select has_table_privilege('service_role','public.content_classification_suggestions','insert')"), "t");
  assert.equal(sql("select has_column_privilege('authenticated','public.content_items','content_pillar','update')"), "t");
  sql(`insert into auth.users (id) values ('${owner}'), ('${other}')`);
  sql(`insert into public.users (id) values ('${owner}'), ('${other}')`);
  sql(`insert into public.projects (id, owner_id, name, code) values ('${project}','${owner}','History','H60')`);
  sql(`insert into public.content_items (id, project_id, owner_id, title, topic, format, production_type, language_code) values ('${item}','${project}','${owner}','The siege','','unknown','unknown','und')`);
  assert.equal(sql(`select content_pillar from public.content_items where id='${item}'`), "");
  asRole("anon", "", "select * from public.content_classification_suggestions", "42501");
  asRole("authenticated", owner, `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','unknown','openai-compatible','test-model','clipforge-metadata-v1','${fingerprint}')`, "42501");
  asRole("authenticated", owner, `update public.content_classification_suggestions set status='accepted'`, "42501");
  asRole("authenticated", owner, "delete from public.content_classification_suggestions", "42501");
  assert.equal(
    asRole("service_role", "", `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','unknown','openai-compatible','test-model','clipforge-metadata-v1','${fingerprint}') returning status`),
    "pending",
  );
  asRole("service_role", "", `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','short_form','openai-compatible','test-model','clipforge-metadata-v1','${otherFingerprint}')`, "23514");
  asRole("service_role", "", `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, topic_confidence, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','unknown',1.1,'openai-compatible','test-model','clipforge-metadata-v1','${otherFingerprint}')`, "23514");
  asRole("service_role", "", `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, pillar_confidence, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','unknown',-0.01,'openai-compatible','test-model','clipforge-metadata-v1','${otherFingerprint}')`, "23514");
  asRole("service_role", "", `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, accepted_fields, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','unknown',array['format'],'openai-compatible','test-model','clipforge-metadata-v1','${otherFingerprint}')`, "23514");
  asRole("service_role", "", `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, accepted_fields, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','unknown',array['topic','topic'],'openai-compatible','test-model','clipforge-metadata-v1','${otherFingerprint}')`, "23514");
  asRole("service_role", "", `insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','unknown','openai-compatible','test-model','clipforge-metadata-v1','${"A".repeat(64)}')`, "23514");
  sql(`insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_production_type, provider, model, prompt_version, source_fingerprint) values ('${item}','${other}','unknown','openai-compatible','test-model','clipforge-metadata-v1','${otherFingerprint}')`, "23503");
  sql(`insert into public.content_classification_suggestions (id, content_item_id, owner_id, suggested_topic, suggested_content_pillar, suggested_production_type, topic_confidence, provider, model, prompt_version, source_fingerprint) values ('${rejected}','${item}','${owner}','Siege engineering','Hidden Engineering','unknown',0.8,'openai-compatible','test-model','clipforge-metadata-v1','${fingerprint}')`);
  sql(`insert into public.content_classification_suggestions (content_item_id, owner_id, suggested_topic, suggested_production_type, provider, model, prompt_version, source_fingerprint) values ('${item}','${owner}','Again','unknown','openai-compatible','test-model','clipforge-metadata-v1','${fingerprint}')`, "23505");
  assert.equal(asRole("authenticated", other, `select count(*) from public.content_classification_suggestions where id='${rejected}'`), "0");
  assert.equal(asRole("authenticated", owner, `select count(*) from public.content_classification_suggestions where id='${rejected}'`), "1");
  assert.equal(
    asRole("authenticated", owner, `update public.content_items set content_pillar='${"p".repeat(80)}' where id='${item}' returning length(content_pillar)`),
    "80",
  );
  asRole("authenticated", owner, `update public.content_items set content_pillar='${"q".repeat(81)}' where id='${item}'`, "23514");
  assert.equal(sql(`select content_pillar from public.content_items where id='${item}'`), "");
  sql(`begin;
    update public.content_classification_suggestions set status='rejected', reviewed_at=now() where id='${rejected}';
    commit;`);
  assert.equal(sql(`select status from public.content_classification_suggestions where id='${rejected}'`), "rejected");
  assert.equal(sql(`select topic || '|' || content_pillar || '|' || format || '|' || production_type from public.content_items where id='${item}'`), "||unknown|unknown");
  sql(`insert into public.content_classification_suggestions (id, content_item_id, owner_id, suggested_topic, suggested_content_pillar, suggested_production_type, provider, model, prompt_version, source_fingerprint) values ('${suggestion}','${item}','${owner}','Siege engineering','Hidden Engineering','new','openai-compatible','test-model','clipforge-metadata-v1','${otherFingerprint}')`);
  sql(`begin;
    update public.content_items set topic='Siege engineering' where id='${item}' and owner_id='${owner}';
    update public.content_classification_suggestions set status='accepted', accepted_fields=array['topic'], reviewed_at=now() where id='${suggestion}';
    commit;`);
  assert.equal(sql(`select topic || '|' || content_pillar || '|' || format || '|' || production_type from public.content_items where id='${item}'`), "Siege engineering||unknown|unknown");
  assert.equal(sql(`select status || '|' || accepted_fields::text from public.content_classification_suggestions where id='${suggestion}'`), "accepted|{topic}");
  assert.equal(sql(`select format || '|' || production_type from public.content_items where id='${item}'`), "unknown|unknown");
});
