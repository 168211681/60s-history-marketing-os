begin;

alter table public.production_workflows
  add column attempts integer not null default 0
    check (attempts between 0 and 10);

comment on column public.production_workflows.attempts is
  'Number of worker claims for this workflow; capped to prevent an endless retry loop.';

commit;
