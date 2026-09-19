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
publishing adapter. The endpoint returns `401` when `MCP_SECRET` is missing or
the bearer header does not match.

Video generation is separate from MCP script drafting. The app accepts a
generation request only for an `approved` draft. The Higgsfield adapter is
disabled unless `HIGGSFIELD_GENERATION_ENABLED=true` and the server-only
`HF_API_KEY_ID` / `HF_API_KEY_SECRET` variables are set. Keep this disabled
until the provider account has explicitly been funded. When enabled, the
server submits a 5-second 9:16 text-to-video request and stores the returned
`request_id`; no generation job is claimed when the provider does not return a
valid request ID.

An approved draft can be placed in the owner-scoped production workflow. Its
state moves through `queued`, `rendering`, `rendered`, and `uploaded_private`;
`published` is a separate human-approved step. MCP can queue a workflow and
inspect its state, but it cannot publish a video by itself.

The protected `/api/cron/production-workflow` endpoint claims one queued,
approved workflow and submits it to the configured Higgsfield provider. It
stores the provider job ID and leaves the workflow in `rendering`; a provider
status poll now moves completed jobs to `rendered` with a validated HTTPS
artifact URL. The next worker run uploads that artifact using a resumable
YouTube session with `privacyStatus=private`, then waits at
`awaiting_publish`. Existing Google connections must reconnect once to grant
the new `youtube.upload` scope.
