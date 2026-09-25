# 60s History Marketing OS

60s History Marketing OS is an analytics and content-intelligence platform for a
YouTube history channel. It collects owner-authorized YouTube data, calculates
evidence-backed marketing insights, supports experiments and reviewed script drafts,
and prepares creative briefs for external editing tools.

Internal video rendering, provider inference, artifact storage, production workers,
YouTube upload, and public publishing are retired from the active product scope.
Historical production rows and audit events remain available as read-only records.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Sample mode needs no keys. Production verification uses:

```sh
npm run lint
npm run typecheck
npm test
npm run build -- --webpack
```

The optional database and browser checks are `npm run test:db` and `npm run test:e2e`.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Channel overview, metrics, recent videos and trend |
| `/videos` | Video search and performance exploration |
| `/analytics` | Channel analytics and metric definitions |
| `/insights` | Evidence, comparisons, hypotheses and experiments |
| `/scripts` | Human-reviewed script drafts and archived production records |
| `/settings` | Owner authentication, read-only YouTube connection and sync |

Sample data is explicitly labeled. Missing API metrics remain `null`; the app does
not invent retention, revenue, CTR, causal claims, or virality.

## Architecture

The active flow is:

```text
YouTube OAuth → Analytics sync → Supabase/PostgreSQL → Insights and experiments
→ Script draft → Human review → Creative brief for an external editing tool
```

- `src/lib/analytics.ts`: tested metric calculations.
- `src/lib/data/`: owner-bound analytics and script-draft readers.
- `src/lib/youtube/`: read-only OAuth, encrypted refresh tokens, captions and sync.
- `src/lib/insights.ts`: deterministic evidence-labeled recommendations.
- `src/lib/ai/provider.ts`: optional provider-agnostic AI adapter.
- `src/app/api/mcp/`: optional authenticated MCP tools for analytics and drafting.
- `supabase/migrations/`: ownership, RLS, analytics, drafts, experiments and archived
  production schemas.

MCP requires the server-only `MCP_SECRET` bearer secret and is optional. It exposes
owner-scoped analytics, insights, content ideas, hypotheses and script drafting. It
does not expose a rendering, worker, upload, or publishing operation.

## Security and configuration

Use `.env.local` or encrypted hosting settings. Never commit OAuth secrets, tokens,
database URLs, service-role keys, or `NEXT_PUBLIC_` secrets. `OWNER_USER_ID` limits
the connected channel to the configured Supabase Auth user. Private analytics queries
constrain `owner_id`, and refresh tokens are encrypted before storage.

The only active scheduled job is the owner-authorized YouTube analytics sync at
`/api/cron/youtube-sync`. The former production cron route remains a `410 Gone`
tombstone and makes no provider or database calls.

## Product decisions

The internal renderer was retired because provider output quality and reliability did
not meet the product goal and could create recurring inference/storage costs. The
intelligence core remains provider-agnostic and useful without paid AI APIs or MCP.
See [docs/adr/0001-analysis-first-scope.md](docs/adr/0001-analysis-first-scope.md)
and [the roadmap](docs/roadmap.md).

## External editing package

The approved-draft export is implemented as a six-file ZIP: a brief, script,
storyboard, voiceover text, captions without invented timestamps, and metadata. It
does not claim that a finished video was generated. When a research project is
linked to the draft, the export implementation composes its evidence status, source
references, supporting claims and uncertainties into the existing files. Unit tests
cover the six-file contract and selected linked-research fields; hosted Staging
export remains unverified. See the [Phase 7 evidence record](docs/architecture/reviews/PHASE-7-FINAL-VERIFICATION.md).

Google and Supabase setup is documented in [docs/connection-setup.md](docs/connection-setup.md).
ChatGPT Plus is not API billing, and deployment verification is separate from local
tests.

Database transition work is intentionally manual. Review the
[production transition runbook](docs/database-transition.md) before taking a backup
or applying the retirement migration. The [owner smoke-test checklist](docs/owner-smoke-test.md)
records reusable verification steps and current evidence. The repository includes guarded
backup, disposable restore, staging migration, permissions, and pending-job scripts
under `scripts/db/`; they refuse to run without explicit safety gates.
