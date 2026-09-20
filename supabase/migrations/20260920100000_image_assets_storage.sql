begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('image-assets', 'image-assets', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

commit;
