begin;

alter table public.production_workflows
  add column if not exists attempts integer not null default 0;

alter table public.production_workflows
  drop constraint if exists production_workflows_attempts_check;

alter table public.production_workflows
  add constraint production_workflows_attempts_check check (attempts between 0 and 10);

commit;
