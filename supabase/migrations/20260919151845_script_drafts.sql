create table public.script_drafts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  content_idea_id uuid references public.content_ideas (id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 200),
  hook text not null check (length(btrim(hook)) between 1 and 2000),
  script_body text not null check (length(btrim(script_body)) between 1 and 20000),
  scene_cues text not null default '' check (length(scene_cues) <= 20000),
  caption_text text not null default '' check (length(caption_text) <= 10000),
  call_to_action text not null default '' check (length(call_to_action) <= 2000),
  research_notes text not null default '' check (length(research_notes) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'approved', 'archived')),
  source text not null default 'codex_mcp' check (source in ('codex_mcp', 'human')),
  model_identifier text check (model_identifier is null or length(btrim(model_identifier)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index script_drafts_channel_created_idx on public.script_drafts (channel_id, created_at desc);
create index script_drafts_idea_idx on public.script_drafts (content_idea_id) where content_idea_id is not null;

comment on table public.script_drafts is
  'Owner-scoped script drafts. AI output remains a draft until a human approves it; no publishing state is stored here.';

alter table public.script_drafts enable row level security;
alter table public.script_drafts force row level security;
revoke all on table public.script_drafts from public, anon, authenticated, service_role;
grant select on table public.script_drafts to authenticated;
grant select, insert, update, delete on table public.script_drafts to service_role;
create trigger set_updated_at before update on public.script_drafts
  for each row execute function private.set_updated_at();

create policy script_drafts_read_own on public.script_drafts for select to authenticated
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));

commit;
