# ClipForge Sprint 004.4A — Review Queue performance acceptance

**Recommendation: PASS for preliminary local performance acceptance.** Recommend draft PR #40 for final review, alongside the existing hosted 44-item owner acceptance on physical iPhone Safari. This is not a claim that hosted performance at 5,000 items has been proved.

- Benchmark date: 2026-10-09.
- Repository: `168211681/60s-history-marketing-os`.
- Branch: `feat/clipforge-review-queue-0044a`.
- Tested commit: `6b1f45fb2bd7331b995bfc051156930460181f82`.
- Production reader, query semantics, indexes, migrations, RLS, deadlines, and application behavior were unchanged.

## Environment and method

Each dataset used a new disposable PostgreSQL cluster created with the repository database-test harness pattern: `initdb`, a Unix socket inside a mode-0700 temporary directory, no TCP listener, `tests/database/bootstrap.sql`, and all 22 existing migrations in filename order. No hosted Staging or Production connection was made. The runner ignores `DATABASE_URL` and inherited `PG*` variables. Both clusters were stopped and removed after verification.

| Component | Configuration |
| --- | --- |
| Node | 22.23.2; locked TSX 4.23.13 registered with `--import` |
| PostgreSQL | 17.11, Debian package; kernel 6.18.44, x86-64 |
| CPU | AMD EPYC 9V74; cgroup quota 2 CPU equivalents (200000/100000) |
| Memory limit | 8 GiB for the container |
| PostgreSQL settings | shared_buffers 128 MiB; work_mem 4 MiB; effective_cache_size 4 GiB; JIT on |
| Disposable-cluster durability | fsync off, matching the existing test harness; measured transactions are read-only |
| Transport / concurrency | Local Unix socket; one connected client; sequential reads |

The runner calls the real `readReviewQueue` through a real `pg.Client`, including `BEGIN`, the reader’s two transaction-setting statements, all data queries, and `COMMIT` in each measured interval. Role/JWT-claim setup, connection creation, seeding, `ANALYZE`, expected-result assertions, and EXPLAIN are outside the measured intervals. Query counting and memory sampling overhead are included. The reader retains its 15-second deadline checks and five-second SQL statement timeout. No timeout or percentile threshold was relaxed.

Each of nine scenarios ran two warmups followed by 20 measured iterations for each of two roles and both sizes: **720 measured reads and 72 warmups**. Roles were `service_role` (existing harness role with BYPASSRLS, checking explicit owner predicates as in a privileged server connection) and `authenticated` (existing forced RLS policies with `auth.uid()` set for the owner). RLS was not disabled or edited. Scenario order was fixed, service role then authenticated; measurements therefore represent warmed, sequential use. p50 and p95 use nearest-rank percentiles: the 10th and 19th ordered samples respectively; maximum is the 20th.

## Deterministic datasets

Sizes below are **per owner**, with an equally sized second owner as isolation and query-planner pressure. IDs, content ordering, titles, project assignment, source metadata, suggestion fingerprints/statuses, and content/video timestamps are deterministic. Routine identity/project audit timestamps use schema defaults and are compared before/after within each run.

| Dataset | Content items, total | Videos | Platform posts | Stored suggestions | Database size |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 per owner | 2,000 | 2,000 | 8,000 | 7,000 | 19.6 MiB |
| 5,000 per owner | 10,000 | 10,000 | 40,000 | 35,000 | 59.3 MiB |

Each dataset has two owners, five projects per owner, and two YouTube channels per owner. Every content item has a linked YouTube video and four platform records (YouTube, Facebook, TikTok, Instagram). Descriptions contain documentary/source-evidence prose with per-episode variation, eight tags, language/category/privacy facts, publication times, and metadata sync times. Titles have an Antikythera subset and otherwise refer to ancient engineering. Description byte lengths were:

| Items per owner | Minimum | Mean | Maximum |
| --- | ---: | ---: | ---: |
| 1,000 | 1,687 | 2,378 | 3,041 |
| 5,000 | 1,687 | 2,394 | 3,055 |

For each ten items: two pending, two accepted, two rejected, one stale pending, one exact-matching superseded record, and two not generated. One accepted and one rejected item have subsequently changed source metadata. Eight items have one selected suggestion plus three superseded historical versions; one has only three unmatched historical versions; one has no suggestion rows. Missing confidence and zero confidence are included. Creation timestamps deliberately tie in groups of three, requiring the existing UUID tie-break.

| Items per owner | Pending | Stale pending | Accepted | Rejected | Superseded | Not generated | Sum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | 200 | 100 | 200 | 200 | 100 | 200 | 1000 |
| 5000 | 1000 | 500 | 1000 | 1000 | 500 | 1000 | 5000 |

## Timing results

All times are milliseconds. Q is the actual number of client-to-PostgreSQL statement executions per read, including BEGIN/COMMIT and the two reader SET statements. Counts were constant across all 20 samples in each row. There were no failed or partial measured reads.

Acceptance thresholds were fixed before measurement: **p95 < 3,000 ms at 1,000 items** and **p95 < 8,000 ms at 5,000 items**. Both roles passed every scenario.

Scenarios: first page and final page use All; Pending/Accepted/Rejected use page one; title search is case-insensitive `Antikythera`; project selects one of five projects; combined applies that title, project, and Pending review; empty searches for a guaranteed absent title. All UI pages contain at most 20 items. State totals remain scoped to project/title matches, before the state filter.

### 1,000 items per owner

| Role | Scenario | p50 ms | p95 ms | Max ms | Q | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Server | All first | 93.2 | 104.9 | 105.6 | 26 | PASS |
| Server | All final | 91.7 | 107.4 | 121.0 | 26 | PASS |
| Server | Pending | 92.5 | 100.6 | 100.9 | 26 | PASS |
| Server | Accepted | 92.3 | 99.4 | 109.6 | 26 | PASS |
| Server | Rejected | 90.8 | 96.4 | 97.5 | 26 | PASS |
| Server | Title search | 12.0 | 17.5 | 27.2 | 9 | PASS |
| Server | Project | 15.8 | 23.1 | 33.5 | 10 | PASS |
| Server | Combined | 3.7 | 4.3 | 5.0 | 7 | PASS |
| Server | Empty | 1.8 | 2.7 | 4.0 | 6 | PASS |
| RLS owner | All first | 101.1 | 113.3 | 129.7 | 26 | PASS |
| RLS owner | All final | 101.2 | 113.8 | 122.0 | 26 | PASS |
| RLS owner | Pending | 99.6 | 119.8 | 146.5 | 26 | PASS |
| RLS owner | Accepted | 102.1 | 118.0 | 135.4 | 26 | PASS |
| RLS owner | Rejected | 100.5 | 115.3 | 115.8 | 26 | PASS |
| RLS owner | Title search | 11.6 | 15.1 | 19.0 | 9 | PASS |
| RLS owner | Project | 15.1 | 19.1 | 19.9 | 10 | PASS |
| RLS owner | Combined | 5.3 | 12.3 | 16.4 | 7 | PASS |
| RLS owner | Empty | 1.9 | 4.7 | 6.7 | 6 | PASS |

### 5,000 items per owner

| Role | Scenario | p50 ms | p95 ms | Max ms | Q | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Server | All first | 1458.6 | 1550.8 | 1561.7 | 106 | PASS |
| Server | All final | 1421.6 | 1549.5 | 1579.1 | 106 | PASS |
| Server | Pending | 1407.8 | 1484.2 | 1522.4 | 106 | PASS |
| Server | Accepted | 1572.7 | 1718.4 | 1805.7 | 106 | PASS |
| Server | Rejected | 1460.3 | 1608.2 | 1648.3 | 106 | PASS |
| Server | Title search | 105.6 | 122.3 | 124.5 | 21 | PASS |
| Server | Project | 104.4 | 110.5 | 111.6 | 26 | PASS |
| Server | Combined | 12.6 | 13.5 | 13.8 | 9 | PASS |
| Server | Empty | 3.3 | 4.4 | 5.5 | 6 | PASS |
| RLS owner | All first | 1631.3 | 1811.6 | 1877.8 | 106 | PASS |
| RLS owner | All final | 1672.2 | 1756.3 | 1863.2 | 106 | PASS |
| RLS owner | Pending | 1657.8 | 1788.7 | 1894.5 | 106 | PASS |
| RLS owner | Accepted | 1717.2 | 1879.7 | 1901.2 | 106 | PASS |
| RLS owner | Rejected | 1722.2 | 1927.2 | 2151.7 | 106 | PASS |
| RLS owner | Title search | 90.1 | 105.9 | 110.2 | 21 | PASS |
| RLS owner | Project | 105.1 | 113.4 | 113.6 | 26 | PASS |
| RLS owner | Combined | 12.8 | 13.9 | 19.4 | 9 | PASS |
| RLS owner | Empty | 3.1 | 3.3 | 4.3 | 6 | PASS |

### Query counts and memory

Full-library/state-filter reads execute 11 source queries + 10 suggestion queries + one project query at 1,000 items; at 5,000, 51 + 50 + one. The extra source query detects the end of an exact 100-row batch boundary. Adding two transaction commands and two SET statements gives **26 and 106 round trips**. Title/project filters reduce the scanned population; state filters do not, because totals are exact. This is two set queries per 100-item batch, with no per-item application query or full-history fetch. Internal indexed lateral lookups still occur within these set queries.

Memory is the maximum observed during measured reads, sampled every 20 ms and at query boundaries. It includes the benchmark’s independent expected-result manifest, driver, and accumulated samples; it is not a pure production-function memory footprint. PostgreSQL backend RSS includes mapped shared pages and must not be added to Node RSS as a unique physical-memory total. Short allocation peaks between samples can be missed. No forced GC occurs during measured reads (one GC after seeding only).

| Items per owner | Role | Peak Node RSS MiB | Peak Node heap used MiB | Peak backend RSS MiB | Longest SQL/client await ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 1,000 | service_role | 185.1 | 71.3 | 42.5 | 14.2 |
| 1,000 | authenticated | 184.9 | 64.0 | 42.5 | 24.9 |
| 5,000 | service_role | 179.9 | 75.8 | 143.9 | 108.1 |
| 5,000 | authenticated | 173.7 | 76.4 | 144.0 | 98.9 |

The SQL/client-await column includes local driver scheduling and transfer, not just PostgreSQL execution. Every measured statement remained below five seconds and every measured read below 15 seconds. Successful reads were checked against complete expected totals; errors were never replaced with empty or partial results.

## EXPLAIN (ANALYZE, BUFFERS) findings

The slowest observed bound invocation of each SELECT family was replayed using `EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)` for each role, in a read-only transaction with the five-second statement timeout. The table shows those replay times, which are distinct from the request timing percentiles and may benefit from warm caches.

| Items per owner | Role/query | Planning ms | Execution ms | Shared hits | Shared reads | Temp written blocks |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | service_role-contexts | 0.322 | 7.574 | 9,073 | 0 | 0 |
| 1,000 | service_role-suggestions | 0.369 | 1.636 | 618 | 0 | 0 |
| 1,000 | service_role-projects | 0.042 | 0.014 | 1 | 0 | 0 |
| 1,000 | authenticated-contexts | 2.449 | 3.977 | 3,674 | 0 | 0 |
| 1,000 | authenticated-suggestions | 0.408 | 1.176 | 626 | 0 | 0 |
| 1,000 | authenticated-projects | 0.048 | 0.043 | 1 | 0 | 0 |
| 5,000 | service_role-contexts | 0.325 | 49.946 | 45,323 | 0 | 0 |
| 5,000 | service_role-suggestions | 0.458 | 2.119 | 1,069 | 0 | 0 |
| 5,000 | service_role-projects | 0.037 | 0.014 | 1 | 0 | 0 |
| 5,000 | authenticated-contexts | 0.422 | 50.673 | 35,424 | 0 | 0 |
| 5,000 | authenticated-suggestions | 0.454 | 2.227 | 1,071 | 0 | 0 |
| 5,000 | authenticated-projects | 0.048 | 0.041 | 1 | 0 | 0 |

- Source queries are the main cost. Plans perform owner/keyset filtering, project joins, and per-candidate YouTube lateral lookups before the final timestamp/UUID sort and LIMIT. Existing platform-item and channel/video indexes serve the relationships. The small channel and project relations can reasonably use sequential scans.
- The schema has no matching `(owner_id, created_at DESC, id DESC)` content index. Source candidates are revisited across keyset batches. For an unfiltered 5,000-item owner, the batches can process roughly `5000 + 4900 + ... + 100 = 127,500` source candidates to return 5,000 sources. Bounded returned rows and linear round-trip counts do not guarantee linear server-side work.
- Suggestion selection uses the existing unique item/prompt/fingerprint index and owner/item/created-at index. Its two priority candidates each have LIMIT 1; the timestamp/UUID sort makes the fallback deterministic. No full histories are returned.
- Sort/buffer details are retained in the raw JSON plans. No query-plan error or statement timeout occurred. No new index, migration, statistics setting, or query rewrite was applied; only normal post-seed ANALYZE was run.
- Because both size targets passed, no optimization is proposed for this sprint. The repeated-source-join behavior and 106 database round trips at 5,000 items remain factors to monitor in hosted environments.

## Correctness and security

- All 720 measured reads and 72 warmups returned manifest-matching state totals, expected page IDs, suggestion states, and stale flags. Totals sum exactly to the project/title-scoped population.
- Exhaustive server-role traversal checked all 50 pages/1,000 owned records and all 250 pages/5,000 owned records. Zero missing IDs, duplicate IDs, or ordering differences. Timestamp ties obeyed the UUID tie-break. Both roles also repeatedly verified first/final pages and filtered pages.
- Accepted and rejected records preserved their stored decisions, including changed-source cases. Exact-matching superseded records remained historical; unmatched superseded-only history appeared as Not generated.
- The second owner’s library was retrieved only when explicitly requested through the privileged server role or under that owner’s authenticated identity. Forging the second owner argument under the first owner’s authenticated session returned no items, projects, or totals. Missing identity returned no records; the anonymous role was denied.
- Forced RLS was verified enabled for content_items and content_classification_suggestions. Existing policies and grants were loaded unchanged.
- The reader’s transaction was verified READ ONLY and REPEATABLE READ, with statement_timeout = 5s. An attempted content UPDATE inside that reader transaction was rejected with SQLSTATE 25006 and rolled back.
- Before/after row counts and ordered row digests matched across users, projects, channels, content items, videos, platform posts, and suggestions. Canonical fields, source facts, stored review decisions, and update timestamps were unchanged.
- Query instrumentation only observed the expected three SELECT families, transaction commands, and settings during timed reads. There were zero HTTP/fetch attempts; the harness rejects outbound fetches, and it imports the read-only reader rather than the inference/provider store. No AI request, background job, metadata mutation, or publishing action occurred.
- Every measured read and EXPLAIN completed; no error was swallowed or converted into partial success.

## Hosted limitations and remaining risks

These local synthetic measurements do **not** establish hosted performance at 5,000 items. They exclude Supabase network/TLS latency, pool checkout/queueing, Vercel cold starts, authentication/session validation, React rendering, response transfer, and the browser. They use one client, warm caches, a small number of projects/channels, three historical versions per classified item, and a dataset that fits readily in memory. Concurrent requests, colder/larger working sets, deeper history, more projects/channels, shared-host contention, and different planner statistics can change results.

At 5,000 items, 106 sequential round trips make database proximity material: an illustrative 10 ms additional round-trip delay alone adds about 1.06 seconds; this is arithmetic, not a hosted measurement. Exact totals scan the filtered library on every page, including the final page. The observed repeated source work is a reason not to extrapolate the results to substantially larger libraries.

The two warmups and 20 samples per case meet the requested preliminary test size but provide limited tail-latency confidence. No concurrent load, cold-cache, cancellation, failure-injection, or physical-memory allocation profiler was run in this benchmark. Existing timeout settings remained active throughout.

The owner has separately reported functional acceptance on the hosted 44-item library using physical iPhone Safari: search, state filters, project filtering, pagination, review navigation, and mobile presentation. That is existing owner evidence, not a new hosted benchmark performed here.

**Release recommendation:** PR #40 is suitable for final review on the basis of the local performance PASS and existing hosted owner acceptance. Latest-head required GitHub/Vercel checks and normal release review remain gates. Do not represent this report as a hosted 5,000-item SLA. No merge or Production deployment is part of this task.

## Reproduction and evidence

The accompanying `clipforge-review-queue-performance-0044a-evidence.tar.gz` contains the local-only runner, all 720 timing/query/memory samples, warmups, raw JSON EXPLAIN plans, correctness results, and progress logs. It creates its own disposable Unix-socket database and cannot accept a hosted URL. The benchmark/report tooling was kept outside the application checkout; the only repository change is this report.

With the locked npm dependencies installed, Node 22.23.2 and PostgreSQL binaries available, run each dataset sequentially from the tested checkout (the runner requires the tested commit):

```bash
node --expose-gc --import ./node_modules/tsx/dist/loader.mjs /path/to/evidence/run.mjs "$PWD" 1000 /tmp/clipforge-perf-results
node --expose-gc --import ./node_modules/tsx/dist/loader.mjs /path/to/evidence/run.mjs "$PWD" 5000 /tmp/clipforge-perf-results
```

Both complete benchmark runs passed. `git diff --check` and the report’s raw-sample/count consistency checks passed. The production-code verification suite was not rerun for this documentation-only delivery; no source changes were necessary.

Evidence file SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `run.mjs` | `4aa831b2f0c8a5ae6efc7df4c4b9beef881491dcaca1af2cd3f35e86dc577881` |
| `results/results-1000.json` | `c6a364d0b9f38fdf146c6a5f5463407ae0db73b466b63cb5a4b7d60bdf74f34b` |
| `results/results-5000.json` | `447226ea7d85afbc39c4730a2bbb0db1f44a943f8d992ffbccd1f6b5b78a2b78` |
