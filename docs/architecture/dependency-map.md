# Analysis-first dependency map

The active product stops at a human-reviewed creative brief. Internal rendering,
upload, and publishing are archived so analytics requests cannot trigger provider
calls or recurring production work.

| Area | Current state | Decision |
| --- | --- | --- |
| Supabase Auth, owner checks, RLS | Used by dashboard, analytics, drafts, and MCP | Retain |
| Google OAuth and YouTube Data/Analytics read APIs | Syncs channel, videos, and metrics | Retain; new OAuth requests are read-only |
| Analytics readers and insight engine | Powers dashboard, `/analytics`, `/insights`, and MCP | Retain |
| Script drafts and human review | Draft/review/approve workflow | Retain; approval means ready for external tools |
| MCP analytics, insight, idea, hypothesis, and draft tools | Owner-scoped and validated | Retain |
| Archived workflow/event readers | Shows historical production audit records | Retain read-only |
| Provider adapters (Higgsfield/Hugging Face) | No active imports or calls | Remove from runtime |
| Video rendering/artifact helpers | No active imports or calls | Remove from runtime; preserve database history |
| Production worker and cron | Route returns `410 PRODUCTION_RETIRED`; scheduled workflow deleted | Disable |
| Workflow creation/retry/publish APIs | Tombstone routes return `410 PRODUCTION_RETIRED` | Disable |
| Upload/publish OAuth helpers and scope | Removed from new OAuth flow | Disable; existing connections are not revoked |
| Provider environment variables | No longer read | Remove from hosting after audit |

`production_workflows`, `video_generation_jobs`, and their event records are
preserved for auditability. The retirement migration revokes application writes;
it does not delete rows, buckets, or historical artifacts.
