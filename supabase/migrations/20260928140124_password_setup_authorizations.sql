-- One-time password setup grants. Apply only after explicit migration approval.
begin;
create table private.password_setup_authorizations (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  flow text not null check (flow in ('recovery', 'invite')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
create index password_setup_authorizations_expiry_idx
  on private.password_setup_authorizations (expires_at);
alter table private.password_setup_authorizations enable row level security;
alter table private.password_setup_authorizations force row level security;
revoke all on table private.password_setup_authorizations from public, anon, authenticated, service_role;
-- Only the trusted server database connection (postgres) can access this table.
-- No Data API grant, RLS allow policy, or SECURITY DEFINER function is added.
comment on table private.password_setup_authorizations is
  'Hashed, owner/session/flow-bound password setup grants. Atomic consume before provider update; no reusable browser-only proof.';
commit;
