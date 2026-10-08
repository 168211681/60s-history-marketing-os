# ClipForge

Private single-owner content operating system. The repository was previously
named 60s History Marketing OS. Sprint 001 is an application-shell change only.

## Working rules

- Inspect `git status`, the current branch, and relevant files before editing.
- Keep YouTube analytics owner-scoped; never expose tokens, secrets, or private metrics to anonymous users.
- Treat sample data as fictional and label it clearly. Preserve `NULL` for metrics the API does not provide.
- Keep AI output separated into observed data, calculated comparison, hypothesis, and experiment. Do not invent causal claims or promise virality.
- AI, MCP, and video providers are optional adapters. The dashboard must remain useful without them.
- Generated scripts remain drafts until a human approves them. Internal video rendering,
  upload, and publishing are retired; do not reintroduce provider calls through UI,
  API, cron, or MCP without a new architecture decision.
- Run targeted lint, typecheck, tests, and build checks appropriate to the change before committing. Review `git diff --check` and the final diff.

## Efficient Codex workflow

- Use `gpt-5.6-luna` with low reasoning for inspection and short status work.
- Use `gpt-5.6-sol` with medium reasoning for normal implementation and verification.
- Escalate to `gpt-6-astra` only for architecture, security, migrations, or repeated hard failures.
- Read only relevant files and batch independent read-only checks. Compact the conversation after a milestone and preserve the current state, verification, blockers, and next action.
- Never put credentials in tracked files, memory, logs, prompts, or test fixtures.

## Current product direction

ClipForge is the private owner workspace. The shell navigation is Dashboard,
Projects, Library, Distribution, Calendar, Analytics, Archive, and Settings.
Projects and Library store owner-scoped project and content-item records.
Distribution is a manual cross-post queue: private master video and thumbnail
files in Cloudflare R2, per-platform copy, and posting status. It does not publish to a platform.
Calendar and Archive remain unfinished placeholders and must not
pretend to store or publish content. Videos, insights, scripts, research,
settings, and YouTube analytics keep their existing routes.

YouTube OAuth, Supabase Auth, PostgreSQL analytics, and daily Vercel sync are
live. The active product is Codex/MCP-assisted evidence-based intelligence,
research, experiments, and reviewed script drafts for external editing tools.
Internal video production is retired; see `docs/adr/0001-analysis-first-scope.md`.

New ClipForge migrations are allowed only when explicitly scoped, locally tested,
and reviewed. Never rewrite, rename, or replay historical migrations. Never
normalize Staging or Production migration history, and never repair the
intentional Phase 6 or Phase 7 timestamp divergence. Staging already contains
`20260928140124_password_setup_authorizations` and
`20261006175601_clipforge_projects_and_content_items`. Do not treat the older
18-migration snapshot as the current hosted inventory. Sprint 004 is
Production-complete: one Production ClipForge project, 41 stored YouTube videos
imported, 41 content items, 164 platform posts, re-import idempotency verified,
and duplicate external YouTube IDs = 0.
Sprint 004.1 is applied and verified on Staging and on Production. Production has
43 YouTube videos, 43 rows with metadata synced, 43 ClipForge content items,
172 platform posts, duplicate external IDs = 0, and a successful v2 sync.
Production's remote migration version is `20261007190850`
`clipforge_youtube_source_metadata`. The repository filename remains
`20261007200200_clipforge_youtube_source_metadata.sql`. That version difference
is intentional. Do not normalize migration history and do not reapply the file.
Sprint 004.2 (`20261008020000_clipforge_metadata_intelligence`) is applied and
verified on Staging and is not applied to Production. Staging has 44 content
items and 3 classification suggestions (1 accepted, 1 rejected, 1 pending).
The verified Staging deployment commit is
`af8edc5b57bb3304078b705224c55b23427ba6da`. Production remains Sprint 004.1
with 43 content items, and its canonical deployment is unchanged. Do not apply
004.2 to Production from this branch. Sprint 004.3A batch classification is
branch-local only. It reuses the single-item classify route, caps a run at
five items, and does not write canonical metadata or add a migration. Do not
deploy it to Staging or Production until it has been reviewed. Do not run it
against Production. The pull-request gate remains
exact equality against Staging. Do not reapply earlier ClipForge migrations.
Production does not contain the password-setup migration and must not be
normalized to add it.
