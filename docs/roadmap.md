# Delivery roadmap

This roadmap is the source of truth for the phased delivery of the Marketing OS.
Each phase must meet its acceptance criteria, pass the listed verification, and
have a security review before the next phase starts.

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

## Phase 3 — insights and reviewed script drafts

**Status: implemented locally; provider-backed AI remains opt-in.**

Acceptance criteria:

- Deterministic analysis distinguishes observations, comparisons, hypotheses, and
  experiments.
- The optional MCP endpoint is authenticated and owner-scoped.
- An owner can create, edit, review, and approve a script draft.
- Approval is required before a production workflow can start.
- No AI key produces an honest unavailable state and never fake AI output.
- The optional provider-agnostic adapter validates structured analysis and script
  output before any future persistence or UI use.

## Phase 4 — production workflow and private artifacts

**Status: partially implemented.**

Acceptance criteria:

- Approved drafts create an idempotent, owner-scoped production workflow.
- Provider adapters have explicit unavailable/error states and do not expose keys.
- Artifacts are stored in a private bucket and accessed with short-lived URLs.
- A worker can retry safely and records each step and failure.
- The owner can run the worker manually from `/scripts` when hosted scheduling is
  unavailable; scheduled execution remains optional.

Remaining work: verify the configured provider with a real low-cost/free run,
add durable retry/timeout telemetry, and verify the end-to-end artifact path on
the deployed environment.

## Phase 5 — private YouTube upload and human publish gate

**Status: partially implemented.**

Acceptance criteria:

- A completed artifact uploads as `private` through the owner’s YouTube token.
- Upload retries are idempotent and quota-aware, with clear error states.
- No unattended public publishing exists.
- The owner can review the private artifact and explicitly publish it in YouTube
  through the owner-only `/api/workflows/[id]/publish` route and Scripts UI.

Remaining work: production verification with a real artifact, upload failure
recovery, and a UI review/publish handoff.

## Phase 6 — closed-loop marketing system

**Status: not started.**

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
