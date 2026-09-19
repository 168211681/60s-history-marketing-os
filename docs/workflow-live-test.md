# Live workflow verification

Use this checklist after the Phase 4/5 deployment. Run it as the channel owner
on the deployed app, not in sample mode.

## Before starting

- Confirm `/settings` shows **Owner signed in** and a connected YouTube channel.
- Confirm the channel has a successful analytics sync.
- Confirm the selected video provider and private `video-artifacts` bucket are
  configured in the server environment.
- Do not paste tokens, client secrets, or signed URLs into an issue or chat.

## Verification sequence

1. Open `/scripts` and create or select a draft.
2. Mark the draft reviewed, then approve it.
3. Select **Start production** and record the workflow id.
4. Select **Run worker now** once. Record the returned status.
5. Expand **Workflow history** and confirm a `claimed` event exists.
6. Run the worker again after the provider job completes. Confirm a `rendered`
   event and that the workflow reaches `awaiting_upload`.
7. Run the worker again. Confirm `uploaded_private`, a YouTube video id, and a
   private video in YouTube Studio. The artifact must have passed through the
   private Supabase Storage bucket.
8. Select **Publish** only after human review. Confirm `published` appears in
   the history and the YouTube privacy state is public.

## Failure evidence

Record only the workflow id, visible status, error code, and event types. Common
expected recovery actions are:

- `*_NOT_CONFIGURED`: configure the server-only provider or storage variables.
- `PROVIDER_TIMEOUT`: inspect the provider job, then use **Retry** once the cause
  is understood; the worker enforces the ten-attempt cap.
- `YOUTUBE_CONNECTION_MISSING`: reconnect YouTube from `/settings`.
- `YOUTUBE_UPLOAD_*`: keep the workflow private, inspect the error, and do not
  publish manually until the upload state is verified.

This checklist is not a substitute for production logs. It proves the deployed
workflow only when the observed event sequence and YouTube privacy states are
recorded.
