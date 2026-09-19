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
uses them. The adapter asks for separate observations, hypotheses, experiments,
and script fields so causal claims and spoken copy are not silently mixed.

This is an adapter contract, not a claim that a provider account, quota, or
billing plan is available. ChatGPT Plus does not supply an API key.
