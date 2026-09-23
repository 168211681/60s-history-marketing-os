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
result in `/insights`. Production schema reconciliation remains a separate,
human-approved migration gate.

Phase 6 rules:

- Compare equivalent inclusive windows only (for example, first 24 hours with first 24 hours, or first 7 days with first 7 days). Different window lengths are insufficient evidence.
- Preserve `NULL` metrics as unavailable. Never treat missing metrics as zero, and return insufficient evidence when required values are missing or a baseline is empty.
- Separate measured observations and deterministic comparisons from hypotheses and next-test recommendations. The evaluator never claims causation, virality, or guaranteed performance.
- A `running` experiment requires a linked published video. A `completed` experiment additionally requires comparable measured evidence; otherwise it remains open for human review.

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
