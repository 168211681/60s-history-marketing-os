insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

set role service_role;
insert into public.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.channels (id, owner_id, youtube_channel_id, title) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'test-channel-a', 'Channel A'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'test-channel-b', 'Channel B');
insert into public.videos (id, channel_id, youtube_video_id, title) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'test-video-a', 'Video A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'test-video-b', 'Video B');
insert into public.video_metrics (video_id, channel_id, metric_date, views) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2026-09-01', 100),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '2026-09-01', 200);
insert into public.channel_metrics (channel_id, metric_date, views) values
  ('20000000-0000-4000-8000-000000000001', '2026-09-01', 100),
  ('20000000-0000-4000-8000-000000000002', '2026-09-01', 200);
insert into public.marketing_insights (channel_id, kind, origin, content, evidence_summary, period_start, period_end) values
  ('20000000-0000-4000-8000-000000000001', 'observation', 'calculated', 'Fixture A', 'One daily fixture', '2026-09-01', '2026-09-01'),
  ('20000000-0000-4000-8000-000000000002', 'observation', 'calculated', 'Fixture B', 'One daily fixture', '2026-09-01', '2026-09-01');
insert into public.content_ideas (id, channel_id, title, updated_at) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Idea A', '2020-01-01'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Idea B', '2020-01-01');
insert into public.content_experiments (id, channel_id, content_idea_id, topic, hook_format, hypothesis) values
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Fixture topic A', 'question', 'Fixture hypothesis A'),
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'Fixture topic B', 'scene', 'Fixture hypothesis B');
insert into private.analytics_sync_jobs (channel_id, idempotency_key, period_start, period_end) values
  ('20000000-0000-4000-8000-000000000001', 'test-period', '2026-09-01', '2026-09-01'),
  ('20000000-0000-4000-8000-000000000002', 'test-period', '2026-09-01', '2026-09-01');
reset role;
