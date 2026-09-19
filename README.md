# 60s History Marketing OS

Phase 1: a responsive, sample-data analytics dashboard for a history Shorts channel.
Phase 2 foundation: a Supabase-compatible migration and locally verified ownership/RLS
rules, ready for a later authenticated integration. See [database setup](docs/database.md).
The owner-only flow can connect YouTube, manually import supported analytics, and
render the latest successful reporting window. Anonymous sessions retain the clearly
labeled fictional workspace. This milestone does not generate or publish content.

## Run locally

Requires Node.js 22+ and npm. The current Supabase client requires Node.js 22.
If nvm is installed, run `nvm use` from the repository root.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The environment file is optional for sample mode; no keys are needed.
In Codespaces, open the forwarded port 3000 in the Ports tab. The layout supports
small mobile screens, including iPhone sizes. Production mode:

```sh
npm run build
npm start
```

If the local Turbopack build cannot start its CSS worker in a restricted
environment, `npm run build -- --webpack` uses Next.js's supported webpack
builder. The local verification command uses this builder in restricted environments.

## Pages

| Route        | Purpose                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| `/`          | Channel overview, totals, recent/top videos, weekly trend, insight status              |
| `/videos`    | Search titles/topics, sort by recency/views/average duration, empty state              |
| `/analytics` | Totals, engagement, accessible weekly values and metric definitions                    |
| `/insights`  | Unavailable AI state and handwritten evidence/comparison/hypothesis/experiment example |
| `/settings`  | Owner access, read-only YouTube connection, manual sync and setup status               |

The reporting window is fixed at Aug 22–Sep 18, 2026; this is not live data.
Video metrics cover the reporting window, not lifetime totals. Subscriber growth
is gains minus losses. Watch hours are estimated minutes divided by 60. Average
duration is total watched seconds divided by total views, not an unweighted
average of video averages. Weekly sample views reconcile with the video totals.
No retention curves, revenue, CTR, causal claims, or prior-period gains are invented.

## Architecture

Next.js App Router, strict TypeScript, React, Tailwind CSS. Server Components render
the pages; small client components handle active navigation, filtering and error
recovery. No UI/chart library, external fonts, or third-party tracking is used.

- `src/app/`: five routes, shared shell, loading/error/404 states and global styling.
- `src/components/`: reusable panels, metrics, chart, video list and navigation.
- `src/lib/sample-data.ts`: explicit fictional fixtures.
- `src/lib/analytics.ts`: pure, tested metric calculations, filtering and sorting.
- `tests/`: unit tests and browser acceptance tests.
- `npm run verify:local`: lint, types, unit, database, build and browser checks.
- `supabase/migrations/`: database schema, explicit grants and owner-scoped RLS.
- `tests/database.test.mjs`: isolated PostgreSQL integration tests (no cloud credentials).
- `src/lib/data/analytics-contract.ts` and `postgres-reader.ts`: owner-bound read
  contract and PostgreSQL implementation for private dashboard data.
- `src/lib/data/workspace.ts`: selects private synced analytics for the verified
  owner and safely falls back to labeled samples for other sessions or failures.
- `src/lib/auth/`: cookie-based Supabase owner session utilities.
- `src/lib/youtube/`: read-only OAuth, token encryption and server-side storage.
- `src/lib/youtube/sync.ts`: validated Data/Analytics API pagination, batching and retry logic.
- `src/lib/insights.ts`: deterministic topic comparisons and evidence-labeled recommendations over the active workspace.
- `src/app/api/youtube/sync`: owner-only manual sync for the latest 28 complete UTC days.
- `docs/connection-setup.md`: Supabase and Google console configuration.
- `docs/mcp.md`: Optional Codex/MCP endpoint setup and tool contract.

Calculations have no AI-vendor dependency. The first optional MCP layer is available
at `/api/mcp`, protected by the server-only `MCP_SECRET` bearer secret. It exposes
owner-scoped tools for synced metrics, video rankings, evidence-backed hypotheses,
content ideas, and structured 60-second script drafts. Drafts remain in `draft`
status and require human review before any future video generation or publishing.
No OpenAI API key is required; the dashboard remains functional without MCP.
The project follows the [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation).

## Verification

GitHub Actions may be unavailable for this repository while the account is
locked by a billing issue. The production worker workflow is included in
`.github/workflows/production-worker.yml` and can be triggered manually or every
five minutes when Actions is available. Verification still runs locally before
commit/push. Install browser
dependencies and native PostgreSQL 15+ tools first. On Ubuntu:

```sh
sudo apt-get install postgresql postgresql-contrib
npx playwright install --with-deps chromium webkit
npm run verify:local
```

Run as a regular user, not root. You can also run each `lint`, `typecheck`,
`test`, `test:db`, `build` and `test:e2e` command separately. Database tests
initialize their own disposable cluster,
use a private Unix socket with TCP disabled, and never connect to `DATABASE_URL`.
See [database setup](docs/database.md) for the schema, permission matrix and limitations.

Browser tests start the production server automatically (build first). They cover
all routes, sample labeling, navigation, search/sort/empty recovery, chart values,
AI availability, 404 recovery, console errors, overflow, and automated WCAG A/AA
checks on desktop Chromium, iPhone-sized Chromium and iPhone WebKit.
WebKit emulation is not a test on physical iPhone hardware. Automated accessibility
tests and keyboard checks do not establish full accessibility compliance.
Loading and error boundaries are present; no production failure switch is exposed
just to demonstrate them.

## Security and configuration

There are no required environment variables for sample mode. `.env.example`
documents optional owner/YouTube connection variables. `.env*` files
are ignored except this example. Never commit tokens, OAuth secrets, private keys,
or service-role credentials. Use local `.env.local` or encrypted hosting settings
for later integrations; never put server secrets in `NEXT_PUBLIC_*`.

When the owner connection is configured on Vercel, set `CRON_SECRET` to a long
random server-only value. The Vercel Cron job calls `/api/cron/youtube-sync` daily
at 03:00 UTC and imports the latest complete 28-day window. The endpoint rejects
requests without the matching `Authorization: Bearer` secret and reuses the
database idempotency key, so a successful window is not imported twice.

Anonymous analytics routes contain fictional data only. A verified owner session can
render private stored analytics; every reader query also constrains `owner_id`, and
matched routes send `private, no-store`. PostgreSQL RLS protects stored analytics and
refresh tokens are encrypted before database storage. Do not log tokens.
Search input is local state rendered by React, never executed as code/HTML/SQL.

## Next milestones

1. **Implemented locally:** database ownership/RLS, owner sign-in, read-only Google
   OAuth, encrypted refresh-token storage and disconnect/revocation.
2. **Implemented locally:** manual YouTube Data/Analytics import with pagination,
   batching, retry/backoff, daily upserts and idempotent reporting-window jobs.
3. **Implemented locally:** authenticated PostgreSQL reader and owner-only Dashboard,
   Videos and Analytics views with explicit sample/live/error states.
4. **Implemented locally:** deterministic topic analysis and evidence-labeled
   recommendations over stored or sample analytics.
5. Add a replaceable hosted AI adapter for hypotheses and experiments with evidence labels.
6. Add an optional video provider adapter after human-approved script drafts. The implemented provider boundary supports `huggingface`; other providers must remain unavailable until their contracts are verified.
7. Configure a private Supabase Storage bucket named `video-artifacts` before enabling a provider that returns raw video bytes. The server-only `SUPABASE_SERVICE_ROLE_KEY` is used only to upload artifacts and create short-lived signed URLs for the private YouTube upload worker.
8. Set `VIDEO_PROVIDER=huggingface` with `HF_TOKEN`, `HF_VIDEO_MODEL`, and `HF_VIDEO_PROVIDER` to enable the synchronous Hugging Face adapter. The free GitHub Actions worker is documented in [production worker setup](docs/production-worker.md).

Google and Supabase setup is in [connection setup](docs/connection-setup.md). Do not
enter credentials into tracked files. ChatGPT Plus is not API billing.

Vercel deployment is separate. Local verification does not mean this project has
been deployed, and GitHub will not show a CI pass for this branch. A sample-data
preview is available at [60s-history-marketing-os.vercel.app](https://60s-history-marketing-os.vercel.app).
Configure the owner flow only after following [connection setup](docs/connection-setup.md);
never place its server secrets in the repository or `NEXT_PUBLIC_*` variables.
