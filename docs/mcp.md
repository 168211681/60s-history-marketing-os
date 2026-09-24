# MCP connection

The Marketing OS exposes an optional authenticated MCP endpoint at `/api/mcp` for
Codex or another MCP-compatible client.

1. Generate a private bearer secret locally:

   ```bash
   openssl rand -base64 48
   ```

2. Add it as the Vercel Production environment variable `MCP_SECRET`.
3. Redeploy after changing the variable.
4. Configure the client with `Authorization: Bearer <your-secret>`.

Available owner-scoped tools:

- `get_channel_metrics`
- `get_top_videos`
- `get_marketing_insights`
- `create_content_idea`
- `save_marketing_hypothesis`
- `save_script_draft`
- `list_research_projects` (read-only; available after the Phase 7 schema is deployed)
- `get_research_project` (read-only; keeps supported, disputed and insufficient claims separate; `FACTS` is empty because source observations are not independently verified by MCP)
- `get_archived_production_records` (read-only history)

MCP does not expose rendering, provider inference, worker execution, YouTube upload,
retry, or publishing. Drafts always start as `draft` and require human review.
The endpoint returns `503 MCP is not configured` without `MCP_SECRET` and `401` for
an invalid bearer header. ChatGPT Plus does not provide unrestricted MCP execution or
paid provider API access.
