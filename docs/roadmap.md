# Delivery roadmap

This roadmap is the source of truth for the phased delivery of the Marketing OS.
Each phase must meet its acceptance criteria, pass the listed verification, and
have a security review before the next phase starts.

## Current execution goal

**Active goal:** stabilize and verify the owner-controlled analytics-to-script
workflow before adding more automation.

The current order is deliberately narrow:

1. Finish local verification for the experiment review flow and its database
   indexes.
2. Keep production rendering experimental and require an explicit owner review
   before any private YouTube upload.
3. Run one complete owner test using real channel data: analyze, generate a
   prompt/script draft, review it, record the experiment result, and inspect the
   evidence shown in the dashboard.
4. Only after that test passes, plan Phase 6 work for linking published-video
   performance back to experiments.

This goal is resumed on the existing active Codex goal. Deployment, commit, and
push are separate approval gates; a local green check does not imply that the
hosted workflow is healthy.

## Phase 0 — repository and security baseline

**Status: complete for the current branch.**

Acceptance criteria:

- Repository, branch, dependencies, routes, migrations, tests, and deployment
  configuration are inventoried.
- Secrets are excluded from Git and documented through `.env.example`.
- The app has a reproducible local verification command.
- Known external blockers, including unavailable hosted CI or missing provider
  credentials, are documented rather than hidden.

Evidence: `README.md`, `AGENTS.md`, `.env.example`, `docs/verification.md`, and
the latest local `npm run verify:local` checks.

## Phase 1 — dashboard MVP

**Status: complete.**

Acceptance criteria:

- `/`, `/videos`, `/analytics`, `/insights`, and `/settings` render on desktop
  and mobile layouts.
- Sample data is visibly labeled and never presented as live analytics.
- Loading, error, empty, navigation, keyboard, and not-found states exist.
- Lint, typecheck, unit tests, production build, and browser checks pass.

## Phase 2 — owner data foundation

**Status: implemented locally; deployment verification remains ongoing.**

Acceptance criteria:

- Supabase migrations provide ownership columns, foreign keys, indexes, and RLS.
- Google sign-in and owner checks protect private analytics routes.
- YouTube OAuth uses state validation, encrypted refresh-token storage, refresh,
  disconnect/revocation, and server-only credentials.
- YouTube Data/Analytics sync validates responses, retries transient errors,
  paginates, and is idempotent for a reporting window.
- The owner sees live, sample, error, or unavailable status explicitly.

Verification: database fixtures/tests, YouTube unit tests, route checks, and a
manual Vercel owner-flow check after the PR is merged or deployed.

## Phase 3 — insights, experiments, and reviewed script drafts

**Status: complete for the MCP-first core workflow.**

Acceptance criteria:

- Deterministic analysis distinguishes observations, comparisons, hypotheses, and
  experiments.
- The optional MCP endpoint is authenticated and owner-scoped.
- An owner can create, edit, review, and approve a script draft.
- Approval is required before a production workflow can start.
- No AI key produces an honest unavailable state and never fake AI output.
- The optional provider-agnostic adapter validates structured analysis and script
  output before any future persistence or UI use.
- Content experiments store a measurable hypothesis, optional draft/video links,
  nullable observed metrics, and a result recommendation under channel ownership.
- MCP returns a copyable GPT Plus prompt from stored analytics and recommends the
  next experiment from evidence plus prior experiment memory.
- The owner can review experiments in `/experiments` and record observed results
  through an owner-only, validated endpoint; empty and database-error states are
  presented separately.
- Reviewed experiments are immutable after `completed` or `cancelled`; later
  recommendations must use a new experiment rather than rewriting history.

Verification: `npm test`, `npm run test:db`, deployed MCP calls for analytics,
prompt generation, experiment creation/listing, and next-recommendation output.

## Phase 4 — production workflow and private artifacts

**Status: experimental; excluded from the default marketing loop.**

Acceptance criteria:

- Approved drafts create an idempotent, owner-scoped production workflow.
- Provider adapters have explicit unavailable/error states and do not expose keys.
- Artifacts are stored in a private bucket and accessed with short-lived URLs.
- A worker can retry safely and records each step and failure.
- The owner can run the worker manually from `/scripts` when hosted scheduling is
  unavailable; scheduled execution remains optional.
- The owner can inspect sanitized workflow events from `/scripts` without exposing
  the private telemetry table to the browser.

The image-first slideshow path has produced private artifacts in deployed tests,
but hosted voice/provider availability is not stable enough to make rendering a
core dependency. Transient provider failures are re-queued automatically up to
the ten-attempt cap; provider credentials and scheduling remain deployment
concerns. Keep this phase behind an experimental control and use
`docs/workflow-live-test.md` to capture any new provider evidence.

## Phase 5 — private YouTube upload and human publish gate

**Status: implemented; deployed verification is tied to Phase 4 artifacts.**

Acceptance criteria:

- A completed artifact uploads as `private` through the owner’s YouTube token.
- Upload retries are idempotent and quota-aware, with clear error states.
- No unattended public publishing exists.
- The owner can review the private artifact and explicitly publish it in YouTube
  through the owner-only `/api/workflows/[id]/publish` route and Scripts UI.

Remaining work: repeat the upload failure-recovery check with a newly rendered
artifact after a provider run is available. The owner-only UI review/publish
handoff is implemented and public publishing remains explicit.

## Phase 6 — closed-loop marketing system

**Status: next phase; start only after the Phase 3 core workflow is user-tested.**

Acceptance criteria:

- Performance sync links published videos to experiments and content ideas.
- The next recommendations cite the observed reporting window.
- AI providers remain replaceable through an adapter and all generated claims are
  evidence-labeled.
- Optional MCP tools expose the same owner-scoped capabilities without becoming a
  runtime dependency.

## Release gates

Before merging or promoting a phase, run the checks appropriate to the change:

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build -- --webpack
npm run test:e2e
```

Then inspect `git diff --check`, review the security surface, verify the relevant
deployed route, and record any skipped check and its reason. A green local build
does not prove that Vercel, Supabase, Google OAuth, or a video provider is
configured in production.
