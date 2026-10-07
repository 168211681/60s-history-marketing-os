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
`20261007200200_clipforge_youtube_source_metadata` is applied and verified on
Staging. Production does not have this migration. Do not apply it to Production
without separate explicit approval. The pull-request gate remains exact equality.
Do not reapply earlier ClipForge migrations.
Production does not contain the password-setup migration and must not be
normalized to add it.
