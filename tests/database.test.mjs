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
    "14",
  );
  assert.equal(
    sql(
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity",
    ),
      "14",
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
