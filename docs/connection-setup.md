# Owner authentication and YouTube connection

The server-side flow remains disabled until the required services and environment
values are configured. Never commit a populated `.env.local` file.

## Requirements

- Node.js 22 or later.
- A Supabase project with the repository migrations applied.
- One Supabase Auth user designated as the workspace owner.
- A Google Cloud OAuth Web client with YouTube Data API v3 and YouTube Analytics API enabled.

## Supabase

1. Apply both files in `supabase/migrations/` to a new or reviewed project.
2. Enable Google as a Supabase Auth provider. Add the Supabase callback URL shown
   in provider settings to the Google client's authorized redirect URIs.
3. Set the Supabase Site URL and redirect allow list. Add
   `${APP_ORIGIN}/auth/callback` exactly.
4. Sign in once in a controlled environment, copy the Auth user's UUID, then set
   it as `OWNER_USER_ID`. Other users cannot connect or inspect the channel.

### Vercel deployment

For the shared deployment, use the stable Vercel origin as `APP_ORIGIN`:

```text
https://60s-history-marketing-os.vercel.app
```

Add these exact URLs to the Supabase redirect allow list and Google OAuth client:

```text
https://60s-history-marketing-os.vercel.app/auth/callback
https://60s-history-marketing-os.vercel.app/api/youtube/callback
```

Set the same values in Vercel Project Settings → Environment Variables. Use the
Preview environment only with a separate test OAuth client; preview URLs are
branch-specific and can change. The public sample dashboard does not require any
of these values.

Supabase Auth is the application login. Its provider tokens are deliberately not
used as the long-lived YouTube credential.

## Google YouTube OAuth

Create a separate OAuth Web client for the channel connection. Add
`${APP_ORIGIN}/api/youtube/callback` as an authorized redirect URI. Set its client
ID and secret as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The application requests only `youtube.readonly` and `yt-analytics.readonly`. It
uses OAuth state, PKCE, an owner-bound ten-minute HttpOnly cookie, offline access,
and explicit consent. Google may require app verification outside configured test users.

## Server secrets

Set `DATABASE_URL` only in server environment settings. Generate an independent
`TOKEN_ENCRYPTION_KEY` as documented in `.env.example`. Refresh tokens use
AES-256-GCM before storage in `private.youtube_connections`; the key never enters PostgreSQL.

Rotating the key requires controlled decrypt/re-encrypt. Losing it requires reconnecting.

## Current scope

Settings can sign in, connect one channel, display its identity, and disconnect.
Disconnect deletes stored channel data and attempts Google token revocation.
The owner can manually sync the latest 28 complete UTC days. The sync discovers the
uploads playlist, refreshes video metadata, requests supported daily channel/video
metrics, and performs idempotent database upserts. It retries network, rate-limit,
and server failures up to three attempts. One reporting window can run only once;
failed or stale jobs can be reclaimed safely.

The API can omit recent or unavailable rows, so the importer stores only rows returned
by Google and preserves missing values as `NULL`. It does not fabricate CTR, retention,
revenue, or zero-value days. See the official [Analytics reports query](https://developers.google.com/youtube/analytics/reference/reports/query),
[channel reports](https://developers.google.com/youtube/analytics/channel_reports), and
[Data API pagination](https://developers.google.com/youtube/v3/guides/implementation/pagination)
documentation. Signed-in owner dashboard pages render the latest successful sync;
anonymous sessions and unconfigured environments retain labeled fictional samples.

Local tests validate URL/state/PKCE construction, encryption and tamper rejection,
provider response validation, pagination/batching/retry behavior, job idempotency,
transactional metric upserts, migrations, and database access. They do not prove
hosted Supabase or Google console configuration, quota availability, or a real sync.
