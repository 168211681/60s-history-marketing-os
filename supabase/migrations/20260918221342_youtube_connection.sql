-- Server-side YouTube refresh tokens. The application encrypts the token before
-- writing it; the database never receives the encryption key.
begin;

alter table public.channels add constraint channels_id_owner_unique unique (id, owner_id);

create table private.youtube_connections (
  owner_id uuid primary key references public.users (id) on delete cascade,
  channel_id uuid not null unique,
  encrypted_refresh_token text not null check (length(encrypted_refresh_token) between 40 and 8192),
  scopes text not null check (length(scopes) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (channel_id, owner_id) references public.channels (id, owner_id) on delete cascade
);
comment on table private.youtube_connections is
  'Server-only encrypted Google refresh tokens. The encryption key must be outside PostgreSQL.';

alter table private.youtube_connections enable row level security;
alter table private.youtube_connections force row level security;
revoke all on table private.youtube_connections from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.youtube_connections to service_role;
create trigger set_updated_at before update on private.youtube_connections
  for each row execute function private.set_updated_at();

commit;
