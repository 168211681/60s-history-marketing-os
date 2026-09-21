-- Internal rendering, artifact upload, and YouTube publishing are archived.
-- Keep historical rows readable for the owner, but remove application write
-- privileges so an old worker or route cannot create new production jobs.
revoke insert, update, delete on table public.production_workflows from service_role;
comment on table public.production_workflows is
  'Archived owner-scoped production history. Internal rendering, upload, and publishing are retired; rows are read-only.';

revoke insert, update, delete on table public.video_generation_jobs from service_role;
comment on table public.video_generation_jobs is
  'Archived provider job history. New provider jobs are disabled by the application and database grants.';
