# Delivery roadmap

This roadmap is the source of truth for the analysis-first Marketing OS. Each phase
must meet its acceptance criteria and pass the relevant verification before the next
phase starts.

## Current execution goal

Validate the owner-controlled analytics-to-content loop: sync YouTube data, inspect
evidence-backed insights, hand a measured prompt to GPT Plus, and save a human-reviewed
script draft. Internal rendering and publishing remain retired.

## ClipForge Sprint 001 — application shell

**Status: complete as a UI foundation.** The private product name is
ClipForge. Navigation exposes Dashboard, Projects, Library, Distribution, Calendar,
Analytics, Archive, and Settings, while Videos, Insights, Scripts, and Research stay
on their existing routes. Projects and Library were placeholders in this sprint and
became owner records in Sprint 002. Distribution is a manual queue. Calendar and Archive remain
placeholders. Staging and Production migration-history differences stay intentional.

## ClipForge Sprint 002 — projects and content items

**Status: applied to Staging after review. Production now has the ClipForge project created by the Sprint 004 import. Do not reapply this migration.**
`public.projects` and `public.content_items` are the first ClipForge records.
A project has its own `owner_id` and does not require a channel. Content
ownership follows the project. There are no asset, caption, post, or analytics
snapshot tables in this sprint. The new migration was created with the Supabase
CLI and is covered by the local database tests.
`20261006175601_clipforge_projects_and_content_items` was applied separately to
Staging after review. Do not reapply it, and do
not rewrite the earlier historical migrations to make histories match.

## ClipForge Sprint 002.5 — password setup authorizations

**Status: original source restored. Already applied on Staging. Absent from Production.**
`private.password_setup_authorizations` is
`supabase/migrations/20260928140124_password_setup_authorizations.sql`
(SHA-256 `9e79a69c7e5f000adb21b2db26e38a87af128c8d7453f187e2145eaffebd49f8`).
Staging already had version `20260928140124`. Sprint 002.5 restored those
bytes and did not apply the migration again. Production does not contain it.
No password-change route or provider update was added. The earlier historical
migration files were not rewritten.

## ClipForge Sprint 002.6 — Staging migration gate

**Status: documentation and read-only CI correction. No migration applied by this sprint.**
At that review, Staging had 17 migrations and this branch had 18. The only
pending version was `20261006175601`. That migration was applied separately to
Staging after review. After that review, Staging and `main` both had 18 migrations.
Later ClipForge sprints added distribution and the Production YouTube import.
Do not treat 18 as the current hosted inventory.
Pull-request validation requires exact local and remote equality and does not push
SQL. `.github/workflows/apply-staging-phase7-research.yml` stays historical
Phase 7 infrastructure and is not a ClipForge apply workflow.

## ClipForge Sprint 003 — assets and distribution matrix

**Status: on main. Production uses these tables for the Sprint 004 import. Do not reapply.**
`20261006210730_clipforge_distribution_assets` adds `public.content_assets`,
`public.platform_posts`, and a covering index on `content_items (project_id, owner_id)`.
Master video and thumbnail bytes go to the private Cloudflare R2 bucket
`clipforge-assets`, not Supabase Storage. Master upload is a direct multipart
upload with bounded per-part retries. Asset metadata is immutable after insert.
Platform rows record copy and status only. This file is not a pending migration
on this branch. Do not reapply it. Sprint 004.1 does not change R2 or this file.

## ClipForge Sprint 004 — legacy YouTube import

**Status: Production-complete. Do not reapply.**
Production has one ClipForge project. 41 stored YouTube videos were imported
into 41 content items and 164 platform posts. Re-import idempotency was
verified. Duplicate external YouTube IDs are 0. Format and production type stay
unknown until a later editorial sprint. Do not rewrite
`20261007143000_clipforge_legacy_youtube_import`.

## ClipForge Sprint 004.1 — YouTube source metadata

**Status: applied and verified on Staging and Production. Do not reapply it.**
`20261007200200_clipforge_youtube_source_metadata` stores YouTube source facts
on `public.videos`: description, one HTTPS thumbnail URL, exact tags bounded by
YouTube's 500-character list budget, category id,
default language, default audio language, privacy status, and
`metadata_synced_at`. It does not classify topic, format, or production type,
and it does not create an R2 asset. This branch does not modify that file.
The pull-request gate remains exact migration equality.

Verified on Staging:

- Migration version `20261007200200_clipforge_youtube_source_metadata`
- Forced RLS preserved
- Security-invoker tag helper
- YouTube OAuth connected successfully
- `youtube-daily-v2-source-metadata` sync succeeded
- 43 YouTube videos synced
- `metadata_synced_at` populated 43/43
- 43 descriptions
- 43 HTTPS thumbnails
- 19 videos with tags
- 42 default languages
- 9 default audio languages
- 43 privacy statuses
- First ClipForge import created 43 content items and 172 platform posts
- Second import created 0 and found 43 already linked
- Duplicate external YouTube IDs = 0
- Imported languages: 42 `en` and 1 `und`
- Existing manual smoke item preserved
- Format and production type remain unknown
- Captions and hashtags remain untouched
- No recent Staging runtime errors
- Production remote version `20261007190850` `clipforge_youtube_source_metadata`
- Repository filename remains `20261007200200_clipforge_youtube_source_metadata.sql`
- That version difference is intentional. Do not normalize migration history
- Production: 43 YouTube videos, 43 metadata synced, 43 content items, 172 platform posts, duplicate external IDs = 0, v2 sync succeeded

## ClipForge Sprint 004.2 — metadata intelligence

**Status: applied in Staging and Production; current database state verified read-only on 2026-10-08. Do not reapply.**
`20261008020000_clipforge_metadata_intelligence` adds `content_items.content_pillar`
(text, at most 80 characters, default empty) and
`public.content_classification_suggestions`. The classifier may suggest topic,
content pillar, and production type only. A person must accept the selected
fields before canonical metadata changes. Generation, rejection, and an
unconfigured provider do not invent or overwrite canonical fields. Format,
language, captions, hashtags, YouTube source facts, R2, and publishing stay
untouched. Sprint 004.2 does not add batch classification. History in 60s (`H60`) pillars are
an application rule, not a global database enum. Production records remote
version `20261008063522_clipforge_metadata_intelligence`; the repository source
remains `20261008020000_clipforge_metadata_intelligence.sql`. This difference,
the Sprint 004.1 version difference, and the earlier Phase 6/7 divergence are
intentional. Do not normalize migration history or reapply these migrations.

Current read-only verification:

| Environment | Content items | Videos | Platform posts | AI suggestions |
| --- | ---: | ---: | ---: | ---: |
| Production | 43 | 43 | 172 | 1 |
| Staging | 44 | 43 | 176 | 10 |

Forced RLS is enabled on `public.content_items` and
`public.content_classification_suggestions` in both environments. This release
does not change schema or Production data.

Initial Staging verification, deployment commit
`af8edc5b57bb3304078b705224c55b23427ba6da`:

- Forced RLS, owner SELECT-only access, server-side writes, constraints, and the ownership foreign key
- Gemini 3.5 Flash-Lite classification succeeded with the strict JSON schema
- Generate stored a valid pending suggestion
- Accept updated only topic and content pillar
- The accepted suggestion kept its source fingerprint and recorded the accepted fields
- Reject left canonical metadata unchanged
- A later Topic change made the suggestion stale and disabled Accept and Reject
- A forced HTTP 409 against the hosted review endpoint was not performed; local regression tests cover that case
- The smoke item topic was restored to `WWII Spitfire red gun-port patches`
- At that initial verification: 44 content items and 3 suggestions (1 accepted, 1 rejected, 1 pending); the current snapshot above supersedes those totals

## ClipForge Sprint 004.4A — metadata review queue

Implemented on `feat/clipforge-review-queue-0044a`; awaiting hosted owner acceptance.
`/review` provides mobile cards, title search, project and review-state filters,
exact owner-scoped totals, and 20-item pages with links to individual reviews.
It preserves reviewed status for stale accepted/rejected suggestions and labels
superseded history explicitly. It shares fingerprint/state logic with the
existing classification flow. Reads are bounded, owner-scoped, and enforced by
a read-only transaction; no new inference or review mutations are introduced.
No migration, Production deployment, or change to the intentional migration
version divergence is required. See `docs/ai.md` for query bounds and large-library
tradeoffs. Staging should verify owner-session navigation, representative states,
and iPhone Safari before release.

## ClipForge Sprint 004.3A — safe batch classification

**Status: Staging owner acceptance complete. Production rollout follows the gated squash merge of PR #39. No new migration.**

The library can preview up to five owned content items and then classify them
one at a time through the existing `POST /api/content-items/[id]/classify`
route. Items that already have a current suggestion are skipped. Stale items
stay on their own clip for a separate decision. There is no bulk accept, no
background worker, and no daily quota. Five items is a per-run limit. No price
is shown because token usage and provider rates are not measured. Closing the
page stops unstarted requests; suggestions already stored remain. Starting a
run invalidates its actionable preview. Completion automatically fetches a
read-only preview, preserving individual Success/Failed results while updating
counts and statuses. Refresh failure clears the preview and requires a manual
refresh before another confirmed run. Nothing is automatically retried.

Staging owner acceptance on the Antikythera clip:

- Batch preview showed 1 new request.
- Confirm and generate returned Success.
- Automatic preview refresh showed 0 new requests and 1 skipped.
- The pending review suggestion persisted.
- Canonical topic and content pillar stayed unchanged.

No migration is added. The release requires passing latest-head GitHub CI,
both Vercel checks, and clean PR mergeability before squash-merging PR #39 to
`main`. The merge triggers the existing Production deployment flow; its
deployment state must then be verified. Production inference smoke checks
remain unperformed, and this release does not change provider settings or
publishing flows.

## Phase 0 — repository and security baseline

**Status: complete.** Repository rules, environment templates, ownership boundaries,
RLS, local verification, and known external blockers are documented.

## Phase 1 — dashboard MVP

**Status: complete.** Dashboard, videos, analytics, insights, settings, sample labels,
loading/error states, mobile layout, and browser checks are implemented.

## Phase 2 — owner data foundation

**Status: implemented locally; deployment verification remains ongoing.** Google OAuth,
encrypted refresh tokens, owner checks, YouTube Data/Analytics sync, retry/backoff,
pagination, idempotent reporting windows, and private PostgreSQL readers are retained.

## Phase 3 — intelligence and reviewed drafts

**Status: implemented locally.** Deterministic insights, experiments, optional MCP
analytics tools, copyable GPT Plus prompts, script drafting, and human review are
available without a paid AI API.

## Phase 4 — analysis-first refactor

**Status: complete.** Internal video providers, rendering, artifact storage, production
workers, upload, and publishing are retired. Their database records and sanitized
audit events remain read-only for history. Retired API routes return `410 Gone`, and
the production schedule is removed so no provider call can start accidentally.

## Phase 5 — external production package

**Status: six-file research-aware package implemented; Staging runtime verification pending.**
The approved-draft export contract contains `content-brief.md`, `script.md`,
`storyboard.md`, `voiceover.txt`, `captions.txt`, and `metadata.json`. Captions have no
fabricated timing and exporting does not generate a video. The owner-scoped export
route loads the linked research project; package generation includes evidence
status, source references, supported claims, and known uncertainties in these six
files. Unit tests check filenames, linked project/source metadata, research
classification, and missing-evidence behavior; they do not exercise the route's
database lookup or hosted export. Production changes and off-host backup remain
separate release gates.

## Phase 6 — closed-loop marketing system

**Status: complete.** Link published-video performance to owner-scoped experiments and
content ideas, compare equivalent reporting windows, and expose a human-reviewable
result in `/insights`. Production reconciliation was applied and verified as remote
`20260924040511_reconcile_content_experiments_schema`; the repository source remains
`20260923231944_reconcile_content_experiments_schema.sql`. The historical version
difference is intentional and must not be repaired, reset or replayed.

Phase 6 rules:

- Compare equivalent inclusive windows only (for example, first 24 hours with first 24 hours, or first 7 days with first 7 days). Different window lengths are insufficient evidence.
- Preserve `NULL` metrics as unavailable. Never treat missing metrics as zero, and return insufficient evidence when required values are missing or a baseline is empty.
- Separate measured observations and deterministic comparisons from hypotheses and next-test recommendations. The evaluator never claims causation, virality, or guaranteed performance.
- A `running` experiment requires a linked published video. A `completed` experiment additionally requires comparable measured evidence; otherwise it remains open for human review.

## Phase 7 — research and fact-checking engine

**Status: implementation merged; Staging and Production schema are applied and
structurally verified; full acceptance remains pending.** PR #27 merged as
`da9428e86b121ba2921a2d42b8636beba853c26f`; the Phase 7 Staging rehearsal succeeded
in workflow run `36001809750` for migration `20260924041349`. Production records the
same migration name at remote version `20260924151134`. PR #29 merged as
`5f1719112aea550f724f20f2791b8924a0b7db0b`.
Owner-scoped research projects link topics, ideas, experiments and drafts to source
observations and reviewed claims. Sources retain human-readable provenance and
limitations; source categories are not truth scores. Claims begin as `insufficient`.
Only a human can assess a claim or approve a research package. A `supported`
assessment requires a linked supporting source and reviewer note. Disputed and
insufficient claims remain visibly separate from supported claims in the UI and MCP.
Existing scripts remain usable without a research link; their evidence status is
`not_researched`.

Local migration source: `20260924041349_research_fact_checking.sql`. Production remote
migration: `20260924151134_research_fact_checking`. This timestamp divergence is
intentional; never repair, replay, reset, or normalize the history. Production UI
research creation, claim review, and project deletion were reported by the owner;
these observations do not establish database-level deletion or two-owner isolation.

Full acceptance is pending: Staging export has not been exercised at runtime,
cross-owner authenticated isolation has not been tested with two hosted owner
sessions, Production runtime logs could not be inspected (403), and the direct HTTP
status of Production project deletion was not captured. The evidence record is
[`Phase 7 final verification`](architecture/reviews/PHASE-7-FINAL-VERIFICATION.md).

## Release gates

Run the checks appropriate to each change:

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build -- --webpack
npm run test:e2e
```

Then inspect `git diff --check`, the security surface, and the relevant deployed route.
A green local build does not prove that Vercel, Supabase, or Google OAuth is configured
in production.
