-- Structured research is private to the channel owner. Existing drafts and notes remain intact.
begin;

create unique index if not exists content_ideas_id_channel_research_idx on public.content_ideas (id, channel_id);
create unique index if not exists content_experiments_id_channel_research_idx on public.content_experiments (id, channel_id);
create unique index if not exists script_drafts_id_channel_research_idx on public.script_drafts (id, channel_id);

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  content_idea_id uuid,
  experiment_id uuid,
  script_draft_id uuid,
  topic text not null check (length(btrim(topic)) between 1 and 200),
  status text not null default 'draft' check (status in ('draft','researching','review','approved','rejected')),
  research_question text not null default '' check (length(research_question) <= 2000),
  summary text not null default '' check (length(summary) <= 10000),
  confidence_note text not null default '' check (length(confidence_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, channel_id),
  foreign key (content_idea_id, channel_id) references public.content_ideas (id, channel_id) on delete set null (content_idea_id),
  foreign key (experiment_id, channel_id) references public.content_experiments (id, channel_id) on delete set null (experiment_id),
  foreign key (script_draft_id, channel_id) references public.script_drafts (id, channel_id) on delete set null (script_draft_id)
);
create index research_projects_channel_updated_idx on public.research_projects (channel_id, updated_at desc);
create unique index research_projects_script_idx on public.research_projects (script_draft_id) where script_draft_id is not null;
create index research_projects_idea_idx on public.research_projects (content_idea_id) where content_idea_id is not null;
create index research_projects_experiment_idx on public.research_projects (experiment_id) where experiment_id is not null;

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  source_type text not null check (source_type in ('primary','academic','museum_archive','reference','journalism','general_web','unknown')),
  title text not null check (length(btrim(title)) between 1 and 500),
  publisher text not null default '' check (length(publisher) <= 300),
  author text check (author is null or length(author) <= 300),
  published_at date,
  url text check (url is null or length(url) <= 2000),
  citation_text text not null check (length(btrim(citation_text)) between 1 and 4000),
  notes text not null default '' check (length(notes) <= 4000),
  reliability_note text not null default '' check (length(reliability_note) <= 4000),
  created_at timestamptz not null default now(),
  unique (id, research_project_id)
);
create index research_sources_project_idx on public.research_sources (research_project_id, created_at);

create table public.research_claims (
  id uuid primary key default gen_random_uuid(),
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  claim_text text not null check (length(btrim(claim_text)) between 1 and 4000),
  verdict text not null default 'insufficient' check (verdict in ('supported','disputed','insufficient','false','contextual')),
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  reviewer_note text not null default '' check (length(reviewer_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, research_project_id)
);
create index research_claims_project_idx on public.research_claims (research_project_id, created_at);

create table public.research_claim_sources (
  research_project_id uuid not null references public.research_projects (id) on delete cascade,
  claim_id uuid not null,
  source_id uuid not null,
  relationship text not null check (relationship in ('supports','contradicts','contextualizes')),
  primary key (claim_id, source_id),
  foreign key (claim_id, research_project_id) references public.research_claims (id, research_project_id) on delete cascade,
  foreign key (source_id, research_project_id) references public.research_sources (id, research_project_id) on delete cascade
);
create index research_claim_sources_source_idx on public.research_claim_sources (source_id);

do $$
declare table_name text;
begin
  foreach table_name in array array['research_projects','research_sources','research_claims','research_claim_sources'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;
create trigger set_updated_at before update on public.research_projects for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.research_claims for each row execute function private.set_updated_at();

create policy research_projects_read_own on public.research_projects for select to authenticated
  using (channel_id in (select id from public.channels where owner_id = (select auth.uid())));
create policy research_sources_read_own on public.research_sources for select to authenticated
  using (research_project_id in (select id from public.research_projects));
create policy research_claims_read_own on public.research_claims for select to authenticated
  using (research_project_id in (select id from public.research_projects));
create policy research_claim_sources_read_own on public.research_claim_sources for select to authenticated
  using (research_project_id in (select id from public.research_projects));

comment on table public.research_claims is 'Human assessment; supported is not inferred from source category or AI text.';
commit;
