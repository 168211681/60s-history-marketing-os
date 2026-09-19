# 60s History Marketing OS

## Working rules

- Inspect `git status`, the current branch, and relevant files before editing.
- Keep YouTube analytics owner-scoped; never expose tokens, secrets, or private metrics to anonymous users.
- Treat sample data as fictional and label it clearly. Preserve `NULL` for metrics the API does not provide.
- Keep AI output separated into observed data, calculated comparison, hypothesis, and experiment. Do not invent causal claims or promise virality.
- AI, MCP, and video providers are optional adapters. The dashboard must remain useful without them.
- Generated scripts and videos remain drafts until a human approves them. Do not enable unattended publishing.
- Run targeted lint, typecheck, tests, and build checks appropriate to the change before committing. Review `git diff --check` and the final diff.

## Efficient Codex workflow

- Use `gpt-5.6-luna` with low reasoning for inspection and short status work.
- Use `gpt-5.6-sol` with medium reasoning for normal implementation and verification.
- Escalate to `gpt-6-astra` only for architecture, security, migrations, or repeated hard failures.
- Read only relevant files and batch independent read-only checks. Compact the conversation after a milestone and preserve the current state, verification, blockers, and next action.
- Never put credentials in tracked files, memory, logs, prompts, or test fixtures.

## Current product direction

The production app is a private owner workspace for 60s History. YouTube OAuth,
Supabase Auth, PostgreSQL analytics, and daily Vercel sync are live. The next
product layer is Codex/MCP-assisted evidence-based insights and 60-second script
drafts, followed by an optional Higgsfield video adapter.
