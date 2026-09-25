# Phase 7 — Final Evidence and Governance Closeout

**Evidence snapshot:** 2026-09-25
**Repository main:** `5f1719112aea550f724f20f2791b8924a0b7db0b`
**Overall state:** Phase 7 implementation and database rollout are complete within the
verified scope; full acceptance remains **PENDING** the evidence gaps below.

This record separates evidence reproduced from repository/GitHub/catalog access in
this closeout from owner-reported browser observations. It does not claim that UI
disappearance proves database deletion or that a one-owner test proves two-owner
isolation.

## Identity and migration history

| Environment | Migration identity | Evidence |
| --- | --- | --- |
| Local repository | `supabase/migrations/20260924041349_research_fact_checking.sql` | Present in `main`; repository contains 16 migration files. |
| Hosted Staging | `20260924041349_research_fact_checking` | Present in current read-only migration listing; the full 16-version list matches local. |
| Production | `20260924151134_research_fact_checking` | Present in current read-only Production migration listing. |

The Production version differs from the local/Staging timestamp by design. Do not
repair, replay, reset, rename, duplicate, or cosmetically normalize migration
history. Phase 6 has the same intentional divergence: local source
`20260923231944_reconcile_content_experiments_schema.sql`, Production remote version
`20260924040511_reconcile_content_experiments_schema`.

## Evidence matrix

| Evidence class | Result | Source and limit |
| --- | --- | --- |
| Automated tests and repository checks | **VERIFIED** | PR #29 merged as `5f1719112aea550f724f20f2791b8924a0b7db0b`. Its GitHub `verify` run `36064818744` passed checkout, Node 22, `npm ci`, unit tests, lint, typecheck, and Webpack build. Its `validate-staging` run `36064818743` passed target identity, read-only PostgreSQL connectivity, exact migration comparison, `npm run test:db`, and read-only retirement verification. The previous implementation run recorded local `npm test` 60 passed, DB 25 passed, E2E 34 passed/2 skipped, lint/typecheck/build passed; these are prior local results, not claims that E2E ran in GitHub CI. |
| Hosted Staging migration rehearsal | **VERIFIED** | GitHub run `36001809750` (`Apply Phase 7 Staging research migration`) succeeded, including exact migration-set guard, dry-run, Staging apply, schema/history checks, and disposable DB security tests. Current read-only migration listing again shows 16 versions and the Phase 7 version. |
| Hosted Staging catalog | **VERIFIED** | Read-only catalog inspection on 2026-09-25 found all four research tables, RLS and FORCE RLS enabled, expected owner-read policies, indexes, foreign keys, and `set_updated_at` triggers on projects and claims. This is structural evidence; it is not an authenticated two-owner API test. |
| Production migration history and catalog | **VERIFIED** | Read-only Production migration listing shows `20260924151134_research_fact_checking`; catalog inspection found the four research tables, RLS/FORCE RLS, expected owner-read policies, indexes, foreign keys, and project/claim update triggers. The migration approval is an owner-confirmed operational fact; no Production writes were performed for this record. |
| Production deployment identity | **OWNER-REPORTED** | The owner reported Vercel Production `READY` on `5f1719112aea550f724f20f2791b8924a0b7db0b`. This closeout did not independently query Vercel Production deployment metadata. |
| Authenticated Production UI research workflow | **OWNER-REPORTED** | The owner reported creating a research project, source, and claim; the claim started `insufficient` / low confidence; unsupported transition attempts were rejected; adding a supporting source and reviewer note allowed `supported`; the project was deleted through the normal UI; and it was absent from the Research UI after reload. Scripts and Insights loaded without visible errors. This is browser-level owner evidence, not independently reproduced here. |
| Production deletion result | **PARTIALLY VERIFIED** | The owner-reported UI flow succeeded within that tested scope. A UI disappearance after reload does not prove database-level deletion or cascade cleanup. The direct HTTP status for Production `DELETE /api/research/[id]` was not captured. |
| Production log inspection | **NOT VERIFIED** | Vercel Production runtime logs were inaccessible due to HTTP 403. No claim is made that logs are clean. |
| Staging six-file export | **NOT VERIFIED at runtime** | Unit tests extract the generated ZIP and assert the six-file contract, but no Staging browser/API export was run. |
| Cross-owner authenticated isolation | **NOT VERIFIED** | No second independently authorized hosted owner session was used. Local SQL/RLS tests and owner-scoped code are not hosted two-owner proof. |

## Production Research and Delete status

**VERIFIED within tested scope:** Production's Phase 7 schema is present and
structurally protected. The owner reported that research project/source/claim
creation, verdict validation, a valid supported transition, project deletion through
the UI, and subsequent absence in the Research UI succeeded.

The scope does not include a captured direct HTTP response, a database query proving
the deleted row and cascade children are absent, or cross-owner authenticated
isolation. These remain separate evidence gaps; no direct database cleanup or
Production mutation was performed for this closeout.

## Export contract and safe verification plan

The six-file contract verified by automated tests is exactly:

1. `content-brief.md`
2. `script.md`
3. `storyboard.md`
4. `voiceover.txt`
5. `captions.txt`
6. `metadata.json`

Tests also verify that caption timestamps are not fabricated. Code inspection shows
that the owner-scoped export route calls `researchForScript(id, owner.id)`. That
reader loads the owner's linked project, sources, claims, and source relationships;
the package builder composes the project ID, evidence status, source references,
supported claims, and known uncertainties into the existing six files. Unit tests
assert the exact filenames, linked project ID and source-reference count; separate
research-model tests cover evidence classification and export tests cover the
missing-evidence case. They do not exercise the route's database lookup or assert
every composed uncertainty/citation value. This verifies implementation and
selected package-builder behavior only; it is **not** evidence that the export
succeeded against hosted Staging.

Safe Staging verification plan:

1. Use an explicitly authorized owner's Staging session to check whether an eligible
   approved draft already exists. Do not enumerate private owner data through a
   privileged credential for convenience.
2. If an eligible draft exists, test the authenticated export route, extract the ZIP,
   and assert exactly the six filenames above, no `.srt`, and no invented timestamps.
   Verify that the existing files contain the linked research ID, evidence state,
   source references, supported claims, and uncertainties.
3. If no eligible draft exists, do not create a synthetic script draft yet. The
   repository has no normal `DELETE /api/scripts/[id]` route. First agree on a
   separately reviewed, owner-scoped cleanup path or obtain explicit approval for
   retaining a clearly marked Staging-only draft. Do not use direct SQL cleanup.
4. Any temporary research project created for this test must be deleted through the
   normal owner-scoped `DELETE /api/research/[id]` route. Verify child cascade
   cleanup through an approved test mechanism; do not infer it from the UI alone.

## Governance and remaining gates

- Keep Phase 7 full acceptance **PENDING** until Staging export is tested at runtime,
  cross-owner authenticated isolation is verified with two authorized sessions,
  the Production direct DELETE HTTP status is captured, and Production logs are
  accessible and reviewed.
- Keep Production migration history unchanged. Do not use migration repair, reset,
  replay, or timestamp normalization.
- No encrypted off-host Production backup has been verified. This document does not
  claim one exists.
- This is a documentation evidence record only; no app code, schema, migration,
  deployment configuration, or Production data is changed by this record.
