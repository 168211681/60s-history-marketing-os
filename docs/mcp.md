# MCP connection

The Marketing OS exposes an optional MCP endpoint at `/api/mcp`. It is a
stateless, server-side endpoint for an external Codex or MCP-compatible client.

1. Generate a private bearer secret locally:

   ```bash
   openssl rand -base64 48
   ```

2. Add that value as the Vercel Production environment variable `MCP_SECRET`.
   Do not put it in Git, a `NEXT_PUBLIC_*` variable, or a chat message.
3. Redeploy the project after changing the environment variable.
4. Configure the client with the endpoint URL and an HTTP header:
   `Authorization: Bearer <your-secret>`.

Available tools are owner-scoped to `OWNER_USER_ID` and read only the connected
channel's stored analytics:

- `get_channel_metrics`
- `get_top_videos`
- `get_marketing_insights`
- `create_content_idea`
- `save_marketing_hypothesis`
- `save_script_draft`
- `start_production_workflow`
- `get_production_workflows`

AI text is stored with provenance. A script draft always starts with status
`draft`; human review is required before adding any future video-generation or
publishing adapter. The endpoint returns `503 MCP is not configured` when
`MCP_SECRET` is missing and `401` when the bearer header does not match.

Video generation is separate from MCP script drafting. The app accepts a
production workflow only for an `approved` draft. The current optional provider
is Hugging Face Inference Providers and requires server-only `HF_TOKEN`, model,
provider, and private Supabase Storage settings. Provider quotas and billing are
controlled by Hugging Face; ChatGPT Plus does not cover them.

An approved draft can be placed in the owner-scoped production workflow. Its
state moves through `queued`, `rendering`, `rendered`, and `uploaded_private`;
`published` is a separate human-approved step. MCP can queue a workflow and
inspect its state, but it cannot publish a video by itself; publishing is only
available through the signed-in owner Scripts UI.

The protected `/api/cron/production-workflow` endpoint claims one queued,
approved workflow and submits it to the configured provider. The free worker
schedule and required secrets are documented in [production worker setup](production-worker.md).
When a provider returns an artifact, the next worker run uploads it using a
resumable YouTube session with `privacyStatus=private`, then waits at
`awaiting_publish`. Existing Google connections must reconnect once to grant
the new `youtube.upload` scope.
