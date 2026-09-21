begin;

alter table public.script_drafts
  drop constraint script_drafts_source_check;

alter table public.script_drafts
  add constraint script_drafts_source_check
  check (source in ('codex_mcp', 'ai_provider', 'human'));

commit;
