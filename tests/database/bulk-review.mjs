import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { previewBulkReview, confirmBulkReview, scopeBulkReview, BulkReviewConflict } from "../../src/lib/clipforge/bulk-review-store.ts";
import { loadContext, lockClassificationContext, reviewLockedSuggestion } from "../../src/lib/clipforge/classification-review.ts";

export function registerBulkReviewTests({ Client, root }) {
  let sequence = 0;
  async function fixture() {
    const prefix = (0x44b00000 + ++sequence).toString(16);
    const id = (n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const owner = id(900), other = id(901), project = id(800), foreign = id(801), channel = id(700), video = id(701);
    const connect = async () => { const c = new Client({ host: root, port: 5432, user: "postgres", database: "postgres" }); await c.connect(); return c; };
    const client = await connect();
    await client.query("insert into auth.users(id) values($1),($2)", [owner, other]);
    await client.query("insert into public.users(id) values($1),($2)", [owner, other]);
    await client.query("insert into public.projects(id,owner_id,name,code) values($1,$2,'Fictional H60','H60'),($3,$4,'FOREIGN PRIVATE','H60')", [project, owner, foreign, other]);
    await client.query("insert into public.channels(id,owner_id,youtube_channel_id,title) values($1,$2,$3,'Fictional channel')", [channel, owner, `bulk-${prefix}`]);
    await client.query("insert into public.videos(id,channel_id,youtube_video_id,title,description) values($1,$2,'bulkvideo01','Source title','Realistic source evidence')", [video, channel]);
    for (let n = 1; n <= 12; n++) {
      const uid = n === 12 ? other : owner;
      await client.query("insert into public.content_items(id,owner_id,project_id,title,topic,content_pillar) values($1,$2,$3,$4,'Current topic','Current pillar')", [id(n), uid, n === 12 ? foreign : project, `Fictional clip ${n}`]);
      if (n === 1) await client.query("insert into public.platform_posts(content_item_id,owner_id,platform,platform_post_id) values($1,$2,'youtube','bulkvideo01')", [id(n), uid]);
      const context = await loadContext(client, uid, id(n));
      await client.query(`insert into public.content_classification_suggestions
        (id,owner_id,content_item_id,suggested_topic,suggested_content_pillar,suggested_production_type,topic_confidence,pillar_confidence,topic_rationale,provider,model,prompt_version,source_fingerprint)
        values($1,$2,$3,'Suggested topic','Hidden Engineering','new',null,0,'Fictional explanation','test','test','clipforge-metadata-v1',$4)`, [id(100+n), uid, id(n), context.fingerprint]);
    }
    const transact = async (c, work) => {
      await c.query("begin");
      try { const result = await work(c); await c.query("commit"); return result; }
      catch (e) { await c.query("rollback"); throw e; }
    };
    const selection = (numbers = [1, 2], action = "accept", fields = ["topic"]) => ({ action, items: numbers.map((n) => ({ contentItemId: id(n), fields: action === "reject" ? [] : fields })) });
    const preview = (input = selection()) => transact(client, (c) => previewBulkReview(c, owner, input));
    const payload = (p) => ({ requestId: p.requestId, action: p.action, items: p.items.map((i) => ({ contentItemId: i.contentItemId, suggestionId: i.suggestionId, version: i.version, fields: i.fields })) });
    const confirm = (input, c = client) => transact(c, (db) => confirmBulkReview(db, owner, input));
    const snapshot = async () => (await client.query(`select
      (select jsonb_agg(i order by id) from public.content_items i where owner_id=$1) items,
      (select jsonb_agg(s order by id) from public.content_classification_suggestions s where owner_id=$1) suggestions,
      (select jsonb_agg(v order by id) from public.videos v where channel_id=$2) videos,
      (select jsonb_agg(p order by id) from public.platform_posts p where owner_id=$1) posts,
      (select jsonb_agg(a order by request_id) from public.content_bulk_review_batches a where owner_id=$1) audits`, [owner, channel])).rows[0];
    return { id, owner, other, project, channel, video, client, connect, transact, selection, preview, payload, confirm, snapshot };
  }
  const check = (name, work) => test(`bulk review: ${name}`, async () => {
    const f = await fixture();
    try { await work(f); } finally { await f.client.end(); }
  });

  check("preview is read-only, uses current suggestions, and has no AI or writes", async (f) => {
    const before = await f.snapshot();
    const fetch = globalThis.fetch;
    globalThis.fetch = () => { assert.fail("No AI or HTTP request is allowed"); };
    try {
      const p = await f.preview(f.selection([1, 2], "accept", []));
      assert.equal(p.canConfirm, false); assert.equal(p.affected, 0);
      assert.equal(p.items[0].suggestion.topicConfidence, null);
      assert.equal(p.items[0].suggestion.pillarConfidence, 0);
      assert.equal(p.items[0].current.topic, "Current topic");
      assert.equal(p.items[0].suggestion.suggestedTopic, "Suggested topic");
      assert.doesNotMatch(JSON.stringify(p), /provider|sourceFingerprint|source_fingerprint|model|FOREIGN/);
      await f.transact(f.client, async (c) => {
        await previewBulkReview(c, f.owner, f.selection());
        assert.equal((await c.query("show transaction_read_only")).rows[0].transaction_read_only, "on");
        await assert.rejects(c.query("update public.content_items set topic='forbidden'"), (e) => e.code === "25006");
      });
      assert.deepEqual(await f.snapshot(), before);
    } finally { globalThis.fetch = fetch; }
  });
  check("per-field accept is atomic, audited, and uses server values", async (f) => {
    const p = await f.preview({ action: "accept", items: [{ contentItemId: f.id(1), fields: ["topic"] }, { contentItemId: f.id(2), fields: ["content_pillar", "production_type"] }] });
    assert.equal(p.affected, 2); assert.equal(p.canConfirm, true);
    const before = await f.snapshot();
    const result = await f.confirm(f.payload(p)); assert.equal(result.affected, 2);
    const after = await f.snapshot();
    assert.equal(after.items[0].topic, "Suggested topic"); assert.equal(after.items[0].content_pillar, "Current pillar"); assert.equal(after.items[0].production_type, "unknown");
    assert.equal(after.items[1].topic, "Current topic"); assert.equal(after.items[1].content_pillar, "Hidden Engineering"); assert.equal(after.items[1].production_type, "new");
    assert.deepEqual(after.suggestions[0].accepted_fields, ["topic"]);
    assert.deepEqual(after.suggestions[1].accepted_fields, ["content_pillar", "production_type"]);
    assert.equal(after.audits.length, 1); const audit = after.audits[0];
    assert.equal(audit.owner_id, f.owner); assert.equal(audit.request_id, p.requestId); assert.equal(audit.outcome, "completed"); assert.equal(audit.action, "accept"); assert.ok(audit.completed_at);
    assert.deepEqual(audit.items.map((i) => i.contentItemId), [f.id(1), f.id(2)]);
    assert.deepEqual(audit.items.map((i) => i.suggestionId), [f.id(101), f.id(102)]);
    assert.deepEqual(before.videos, after.videos); assert.deepEqual(before.posts, after.posts);
  });
  check("reject preserves canonical fields and retry returns the same durable outcome", async (f) => {
    const p = f.payload(await f.preview(f.selection([1, 2], "reject")));
    const before = await f.snapshot(); const first = await f.confirm(p);
    const after = await f.snapshot(); const again = await f.confirm({ ...p, items: [...p.items].reverse() });
    assert.equal(first.replayed, false); assert.equal(again.replayed, true); assert.equal(first.completedAt, again.completedAt);
    assert.deepEqual(after, await f.snapshot()); assert.deepEqual(before.items, after.items);
    assert.ok(after.suggestions.slice(0, 2).every((i) => i.status === "rejected"));
    await assert.rejects(f.confirm({ ...p, action: "accept", items: p.items.map((i) => ({ ...i, fields: ["topic"] })) }), BulkReviewConflict);
  });
  check("cross-owner ID injection, missing IDs, and invalid batches cannot write", async (f) => {
    const before = await f.snapshot();
    await assert.rejects(f.preview(f.selection([1, 12])), BulkReviewConflict);
    await assert.rejects(f.preview(f.selection([99])), BulkReviewConflict);
    const p = f.payload(await f.preview());
    for (const value of [{ ...p, items: [...p.items, p.items[0]] }, { ...p, items: Array(11).fill(p.items[0]) }, { ...p, ownerId: f.other }, { ...p, items: [{ ...p.items[0], contentItemId: f.id(12), suggestionId: f.id(112) }] }]) {
      await assert.rejects(f.confirm(value), BulkReviewConflict);
    }
    assert.deepEqual(await f.snapshot(), before);
  });
  check("a full ten-clip batch succeeds with all fields explicitly selected", async (f) => {
    const p = await f.preview(f.selection(Array.from({ length: 10 }, (_, i) => i + 1), "accept", ["topic", "content_pillar", "production_type"]));
    assert.equal(p.affected, 10);
    const outcome = await f.confirm(f.payload(p)); assert.equal(outcome.affected, 10);
    const after = await f.snapshot();
    assert.equal(after.suggestions.filter((s) => s.status === "accepted").length, 10);
    assert.equal(after.suggestions.find((s) => s.id === f.id(111)).status, "pending");
    assert.equal(after.audits[0].items.length, 10);
  });
  for (const status of ["accepted", "rejected", "superseded"]) check(`${status} suggestions cannot enter bulk review`, async (f) => {
    await f.client.query("update public.content_classification_suggestions set status=$1 where id=$2", [status, f.id(102)]);
    const p = await f.preview(); assert.equal(p.canConfirm, false); assert.equal(p.items[1].eligible, false);
    const before = await f.snapshot(); await assert.rejects(f.confirm(f.payload(p)), BulkReviewConflict); assert.deepEqual(await f.snapshot(), before);
  });
  for (const action of ["accept", "reject"]) check(`${action} refuses stale or missing suggestions`, async (f) => {
    await f.client.query("update public.content_classification_suggestions set source_fingerprint=$1 where id=$2", ["b".repeat(64), f.id(101)]);
    await f.client.query("delete from public.content_classification_suggestions where id=$1", [f.id(102)]);
    const p = await f.preview(f.selection([1, 2], action));
    assert.equal(p.canConfirm, false); assert.ok(p.items.every((i) => !i.eligible && i.warnings.length));
    const before = await f.snapshot(); await assert.rejects(f.confirm(f.payload(p)), BulkReviewConflict); assert.deepEqual(await f.snapshot(), before);
  });
  for (const change of ["source", "pillar", "project", "suggestion", "status", "identity"]) check(`${change} change after preview rolls back the entire batch`, async (f) => {
    const p = f.payload(await f.preview());
    if (change === "source") await f.client.query("update public.videos set description='changed' where id=$1", [f.video]);
    if (change === "pillar") await f.client.query("update public.content_items set content_pillar='owner edit' where id=$1", [f.id(2)]);
    if (change === "project") await f.client.query("update public.projects set code='OTHER' where id=$1", [f.project]);
    if (change === "suggestion") await f.client.query("update public.content_classification_suggestions set suggested_topic='changed' where id=$1", [f.id(102)]);
    if (change === "status") await f.client.query("update public.content_classification_suggestions set status='rejected' where id=$1", [f.id(102)]);
    if (change === "identity") await f.client.query("update public.content_classification_suggestions set id=$1 where id=$2", [f.id(500), f.id(102)]);
    const before = await f.snapshot(); await assert.rejects(f.confirm(p), BulkReviewConflict); assert.deepEqual(await f.snapshot(), before);
    await assert.rejects(f.preview({ action: p.action, items: p.items }), BulkReviewConflict);
  });
  check("invalid H60 pillars cannot be accepted, but an unrelated valid field remains available", async (f) => {
    await f.client.query("update public.content_classification_suggestions set suggested_content_pillar='Invalid H60 pillar' where id=$1", [f.id(101)]);
    const p = await f.preview(f.selection([1], "accept", ["content_pillar"]));
    assert.equal(p.canConfirm, false); assert.ok(!p.items[0].availableFields.includes("content_pillar"));
    await assert.rejects(f.confirm(f.payload(p)), BulkReviewConflict);
    await f.confirm(f.payload(await f.preview(f.selection([1], "accept", ["topic"]))));
  });
  check("an error after the first review update rolls back updates AND audit", async (f) => {
    const p = f.payload(await f.preview()); const before = await f.snapshot();
    // A local-only trigger proves rollback after an actual earlier update.
    await f.client.query(`create function pg_temp.fail_second_bulk_item() returns trigger language plpgsql as $$ begin if new.id = '${f.id(2)}'::uuid then raise exception 'injected mid-batch failure'; end if; return new; end $$`);
    await f.client.query("create trigger test_bulk_failure before update on public.content_items for each row execute function pg_temp.fail_second_bulk_item()");
    try { await assert.rejects(f.confirm(p), /injected mid-batch failure/); assert.deepEqual(await f.snapshot(), before); }
    finally { await f.client.query("drop trigger test_bulk_failure on public.content_items"); }
  });
  check("concurrent identical confirmations apply once; overlapping batches conflict atomically", async (f) => {
    const p = f.payload(await f.preview()); const second = await f.connect();
    try {
      const results = await Promise.all([f.confirm(p), f.confirm(p, second)]);
      assert.deepEqual(results.map((r) => r.replayed).sort(), [false, true]);
      assert.equal((await f.snapshot()).audits.length, 1);
      const a = f.payload(await f.preview(f.selection([3, 4], "reject")));
      const b = f.payload(await f.preview(f.selection([4, 3], "accept")));
      const competing = await Promise.allSettled([f.confirm(a), f.confirm(b, second)]);
      assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(competing.filter((r) => r.status === "rejected" && r.reason instanceof BulkReviewConflict).length, 1);
      assert.equal((await f.snapshot()).audits.length, 2);
    } finally { await second.end(); }
  });
  check("bulk role enforces RLS and source locks without granting source writes", async (f) => {
    const contender = await f.connect();
    const post = (await f.client.query("select id from public.platform_posts where content_item_id=$1", [f.id(1)])).rows[0].id;
    try {
      await f.client.query("begin"); await scopeBulkReview(f.client, f.owner, false);
      const role = (await f.client.query("select current_user, rolbypassrls, rolsuper from pg_roles where rolname=current_user")).rows[0];
      assert.equal(role.current_user, "clipforge_bulk_reviewer"); assert.equal(role.rolbypassrls, false); assert.equal(role.rolsuper, false);
      assert.equal((await f.client.query("select id from public.content_items where owner_id=$1", [f.other])).rowCount, 0);
      assert.equal((await f.client.query("update public.content_items set topic='forged' where id=$1", [f.id(12)])).rowCount, 0);
      assert.equal(await lockClassificationContext(f.client, f.owner, f.id(1)), true);
      for (const [table, id] of [["projects", f.project], ["platform_posts", post], ["channels", f.channel], ["videos", f.video]]) {
        await contender.query("begin"); await contender.query("set local lock_timeout='100ms'");
        await assert.rejects(contender.query(`update public.${table} set id=id where id=$1`, [id]), (e) => e.code === "55P03");
        await contender.query("rollback");
        await f.client.query("savepoint denied_source_write");
        await assert.rejects(f.client.query(`update public.${table} set id=id where id=$1`, [id]), (e) => e.code === "42501");
        await f.client.query("rollback to savepoint denied_source_write");
      }
      await f.client.query("rollback");
      assert.equal((await f.client.query("select current_user")).rows[0].current_user, "postgres");
    } finally { await f.client.query("rollback"); await contender.end(); }
  });
  check("audit is owner-readable, forced-RLS, immutable, and inaccessible to anonymous writers", async (f) => {
    const p = f.payload(await f.preview()); await f.confirm(p);
    assert.deepEqual((await f.client.query("select relrowsecurity, relforcerowsecurity from pg_class where oid='public.content_bulk_review_batches'::regclass")).rows[0], { relrowsecurity: true, relforcerowsecurity: true });
    for (const [role, uid, count] of [["authenticated", f.owner, 1], ["authenticated", f.other, 0], ["clipforge_bulk_reviewer", f.other, 0]]) {
      await f.transact(f.client, async (c) => { await c.query(`set local role ${role}`); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]); assert.equal((await c.query("select * from public.content_bulk_review_batches where owner_id=$1", [f.owner])).rowCount, count); });
    }
    for (const role of ["anon", "authenticated", "clipforge_bulk_reviewer"]) {
      await assert.rejects(f.transact(f.client, async (c) => { await c.query(`set local role ${role}`); await c.query("delete from public.content_bulk_review_batches"); }), (e) => e.code === "42501");
      await assert.rejects(f.transact(f.client, async (c) => { await c.query(`set local role ${role}`); await c.query("update public.content_bulk_review_batches set outcome='completed'"); }), (e) => e.code === "42501");
    }
    await assert.rejects(f.transact(f.client, async (c) => { await scopeBulkReview(c, f.owner, false); await c.query("insert into public.content_bulk_review_batches(owner_id,request_id,action,request_hash,items) values($1,$2,'reject',$3,$4)", [f.other, randomUUID(), "a".repeat(64), JSON.stringify(p.items)]); }), (e) => e.code === "42501");
    // Change session authorization as well: SET ROLE alone leaves the original
    // superuser session_user's ability to assume any role.
    for (const role of ["authenticated", "anon"]) {
      await assert.rejects(f.transact(f.client, async (c) => { await c.query(`set local session authorization ${role}`); await c.query("set local role clipforge_bulk_reviewer"); }), (e) => e.code === "42501");
    }
    await f.transact(f.client, async (c) => {
      await c.query("set local session authorization service_role");
      await scopeBulkReview(c, f.owner, true);
      assert.equal((await c.query("select current_user")).rows[0].current_user, "clipforge_bulk_reviewer");
    });
    assert.equal((await f.client.query("select pg_has_role('authenticated','clipforge_bulk_reviewer','MEMBER') member")).rows[0].member, false);
    assert.equal((await f.client.query("select pg_has_role('anon','clipforge_bulk_reviewer','MEMBER') member")).rows[0].member, false);
  });
  check("single-item review continues using the same helper, including its existing stale-reject rule", async (f) => {
    await f.client.query("update public.content_classification_suggestions set source_fingerprint=$1 where id=$2", ["e".repeat(64), f.id(101)]);
    const result = await f.transact(f.client, (c) => reviewLockedSuggestion(c, f.owner, f.id(1), f.id(101), "reject", []));
    assert.equal(result.kind, "suggestion"); assert.equal(result.suggestion.status, "rejected");
    assert.equal((await f.snapshot()).audits, null);
  });
}
