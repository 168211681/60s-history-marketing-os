begin;

alter table public.production_workflows
  add column provider_job_id text check (provider_job_id is null or length(btrim(provider_job_id)) between 1 and 300);

commit;
