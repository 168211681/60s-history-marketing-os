-- Read-only inventory for a trusted database operator. Do not run from the browser.
-- Results identify work to stop; they do not update or delete rows.

select 'production_workflows' as source, status, count(*) as rows,
       min(created_at) as oldest_created_at, max(updated_at) as newest_updated_at
from public.production_workflows
where status in ('queued', 'rendering', 'rendered', 'uploaded_private')
group by status
order by status;

select 'video_generation_jobs' as source, status, count(*) as rows,
       min(created_at) as oldest_created_at, max(updated_at) as newest_updated_at
from public.video_generation_jobs
where status in ('queued', 'running')
group by status
order by status;

select pw.id, pw.channel_id, pw.status, pw.attempts, pw.created_at, pw.updated_at
from public.production_workflows pw
where pw.status in ('queued', 'rendering', 'rendered', 'uploaded_private')
order by pw.created_at asc;

select vgj.id, vgj.channel_id, vgj.status, vgj.provider, vgj.created_at, vgj.updated_at
from public.video_generation_jobs vgj
where vgj.status in ('queued', 'running')
order by vgj.created_at asc;

-- Expected transition result: no new rows are created after deployment. Existing
-- rows remain for audit and are handled by an explicitly approved DBA procedure.
