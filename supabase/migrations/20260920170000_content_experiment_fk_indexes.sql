begin;

-- Support owner-scoped joins and cleanup of nullable experiment references.
create index content_experiments_content_idea_idx
  on public.content_experiments (content_idea_id)
  where content_idea_id is not null;
create index content_experiments_script_draft_idx
  on public.content_experiments (script_draft_id)
  where script_draft_id is not null;
create index content_experiments_video_idx
  on public.content_experiments (video_id)
  where video_id is not null;

commit;
