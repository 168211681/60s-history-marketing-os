# Delivery roadmap

This roadmap is the source of truth for the analysis-first Marketing OS. Each phase
must meet its acceptance criteria and pass the relevant verification before the next
phase starts.

## Current execution goal

Validate the owner-controlled analytics-to-content loop: sync YouTube data, inspect
evidence-backed insights, hand a measured prompt to GPT Plus, and save a human-reviewed
script draft. Internal rendering and publishing remain retired.

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

**Status: complete.** Export an approved draft into a structured package for an
external editor. Include only supported content: brief, script, storyboard, voiceover
text, caption text without fabricated timing, metadata, research references, and fact-
check status. Exporting a package does not generate a video. Future Production
changes and off-host backup remain separate release gates.

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

**Status: implemented on feature branch; Staging rehearsal and deployment verification pending.**
Owner-scoped research projects link topics, ideas, experiments and drafts to source
observations and reviewed claims. Sources retain human-readable provenance and
limitations; source categories are not truth scores. Claims begin as `insufficient`.
Only a human can assess a claim or approve a research package. A `supported`
assessment requires a linked supporting source and reviewer note. Disputed and
insufficient claims remain visibly separate from supported claims in the UI, MCP
and six-file creative brief export. Existing scripts remain usable without a
research link; their evidence status is `not_researched`.

Research migration `20260924041349_research_fact_checking.sql` is forward-only.
Apply it to isolated Staging only after reviewing the SQL and confirming the
project target. Production migration requires a separate human-approved gate.

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
