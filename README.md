# 60s History Marketing OS

Phase 1: a responsive, sample-data analytics dashboard for a history Shorts channel.
**Every metric and video title is fictional. No YouTube, database, authentication,
or AI service is connected.** This milestone does not generate or publish content.

## Run locally

Requires Node.js 20.9+ (Node.js 22 recommended) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The environment file is optional; no keys are needed.
In Codespaces, open the forwarded port 3000 in the Ports tab. The layout supports
small mobile screens, including iPhone sizes. Production mode:

```sh
npm run build
npm start
```

## Pages

| Route        | Purpose                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| `/`          | Channel overview, totals, recent/top videos, weekly trend, insight status              |
| `/videos`    | Search titles/topics, sort by recency/views/average duration, empty state              |
| `/analytics` | Totals, engagement, accessible weekly values and metric definitions                    |
| `/insights`  | Unavailable AI state and handwritten evidence/comparison/hypothesis/experiment example |
| `/settings`  | Read-only connection status and future integration requirements                        |

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
- `.github/workflows/ci.yml`: install/lint/types/tests/build/browser checks.

Calculations have no AI-vendor dependency. A future provider adapter and optional
MCP layer can be added when real-data analysis is implemented. Neither is required
to operate this dashboard. No integration stubs claim success.
The project follows the [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation).

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Browser tests start the production server automatically (build first). They cover
all routes, sample labeling, navigation, search/sort/empty recovery, chart values,
AI availability, 404 recovery, console errors, overflow, and automated WCAG A/AA
checks on desktop Chromium, iPhone-sized Chromium and iPhone WebKit.
WebKit emulation is not a test on physical iPhone hardware. Automated accessibility
tests and keyboard checks do not establish full accessibility compliance.
Loading and error boundaries are present; no production failure switch is exposed
just to demonstrate them.

## Security and configuration

There are no required environment variables in Phase 1. `.env.example` documents
that contract; adding credentials does not activate any integration. `.env*` files
are ignored except this example. Never commit tokens, OAuth secrets, private keys,
or service-role credentials. Use local `.env.local` or encrypted hosting settings
for later integrations; never put server secrets in `NEXT_PUBLIC_*`.

All current routes are public and contain fictional data only. **Do not replace
fixtures with private analytics.** Before introducing real data, implement owner
authentication and server-side authorization, channel ownership, PostgreSQL RLS,
encrypted token storage, and authenticated sync endpoints. Do not log tokens.
Search input is local state rendered by React, never executed as code/HTML/SQL.

## Next milestones (not implemented)

1. Database migrations, ownership model and RLS with isolation tests.
2. Owner sign-in and Google OAuth: verified state, least-privilege scopes, secure
   refresh-token storage, refresh/revocation and disconnect handling.
3. YouTube Data/Analytics sync with quota management, backoff and idempotency.
4. Analysis over stored analytics, replaceable AI adapters and evidence labels.
5. Future production tools and optional MCP, explicit human publishing approval.

Google setup and variable names will be documented alongside the actual OAuth
implementation; no OAuth callback or connection exists in Phase 1. Do not enter
credentials into this sample workspace. ChatGPT Plus is not API billing.

Vercel deployment is separate. A local build does not mean this project has been
deployed or that GitHub CI has passed.
