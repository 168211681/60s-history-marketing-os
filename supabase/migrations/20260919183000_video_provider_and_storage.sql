begin;

alter table public.video_generation_jobs
  drop constraint video_generation_jobs_provider_check;

alter table public.video_generation_jobs
  add constraint video_generation_jobs_provider_check
  check (provider in ('higgsfield', 'huggingface', 'fal', 'replicate', 'runway'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-artifacts', 'video-artifacts', false, 268435456, array['video/mp4', 'video/webm']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
