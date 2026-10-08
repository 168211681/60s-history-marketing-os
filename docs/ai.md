# Optional AI adapter

The app does not require an AI API key. Without explicit configuration,
`aiProvider()` returns an unavailable provider and the dashboard keeps showing
deterministic, evidence-labeled analysis.

The optional adapter accepts any server-side endpoint that implements the
OpenAI-compatible `POST /chat/completions` contract. Configure these variables
only in Vercel or a local `.env.local`:

```sh
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=server-only-secret
AI_MODEL=your-model
```

The key is never exposed through `NEXT_PUBLIC_*`. Responses are treated as
untrusted text and must pass the bounded `zod` schemas before the application
uses them. Analysis and script drafts still ask for a JSON object. Metadata
classification sends a strict JSON schema on the same chat-completions call,
including nullable confidence fields and every rationale field. A response that
fails that schema is `AI_INVALID_RESPONSE`. Validation logs record only Zod
issue paths and codes, never the model text or the API key. The adapter asks
for separate observations, hypotheses, experiments, and script fields so causal
claims and spoken copy are not silently mixed.

This is an adapter contract, not a claim that a provider account, quota, or
billing plan is available. ChatGPT Plus does not supply an API key.

## Owner-only routes

When the adapter is configured, the signed-in owner can call:

- `POST /api/ai/analyze` to generate a structured analysis for the current
  reporting window. The response is private and is not written as an
  authoritative insight until it is reviewed.
- `POST /api/ai/script` with `topic`, and optional `angle`, `evidence`, and
  `researchNotes`, to save an AI-generated script as a `draft`.

Both routes require the owner session and an exact `Origin` matching
`APP_ORIGIN`. Script output is explicitly marked `ai_provider` and remains
subject to human review before export to an external editing tool.

## Staging classification check

Sprint 004.2 classification was verified on Staging at deployment commit
`af8edc5b57bb3304078b705224c55b23427ba6da`. The configured model was Gemini 3.5
Flash-Lite through this OpenAI-compatible adapter, using the strict
classification JSON schema. Generate stored a valid pending suggestion. Accept
updated only topic and content pillar, preserved the suggestion's source
fingerprint, and recorded the accepted fields. Reject left canonical metadata
unchanged. After Topic changed, the panel treated the suggestion as stale and
disabled Accept and Reject. A forced HTTP 409 against the hosted review
endpoint was not performed; local regression tests cover that case. No API key,
base URL, or model response text is recorded here. Production does not have
this migration or this classification check.

## Batch classification

Sprint 004.3A is branch-local only and is not deployed to Staging or
Production. An owner may preview at most five of their own content items and
confirm a sequential run. Each new suggestion still uses
`POST /api/content-items/[id]/classify`. The batch does not accept metadata,
does not retry 429, 409, or 502 automatically, and does not show a currency
cost. The cap is per run, not a daily quota. Gemini prompts and model settings
are unchanged.
