alter table public.script_drafts
  add column if not exists edit_plan jsonb;

comment on column public.script_drafts.edit_plan is
  'Owner-scoped, human-reviewable scene timeline. Asset paths must refer to uploaded image assets.';
