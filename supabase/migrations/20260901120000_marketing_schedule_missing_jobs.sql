-- Detects calendar slots that look scheduled but have no executable job.
--
-- The calendar reads marketing_post_schedules while pg_cron only dispatches
-- publication_jobs. When the two drift apart the UI shows a post as queued and
-- it silently never publishes, which is invisible until someone notices the
-- missing post days later.

CREATE OR REPLACE VIEW public.marketing_schedules_missing_jobs
WITH (security_invoker = true) AS
SELECT
  s.id AS schedule_id,
  s.tenant_id,
  s.post_id,
  p.title AS post_title,
  s.scheduled_at,
  s.timezone,
  s.status AS schedule_status
FROM public.marketing_post_schedules s
JOIN public.social_posts p ON p.id = s.post_id
WHERE s.status IN ('planned', 'queued')
  AND p.deletion_status = 'none'
  AND p.publication_status = 'scheduled'
  AND NOT EXISTS (
    SELECT 1
    FROM public.publication_jobs j
    WHERE j.post_id = s.post_id
      AND j.status IN ('pending', 'processing', 'retrying')
  );

COMMENT ON VIEW public.marketing_schedules_missing_jobs IS
  'Scheduled posts whose calendar slot has no active publication job — they will never publish.';

GRANT SELECT ON public.marketing_schedules_missing_jobs TO authenticated;
GRANT SELECT ON public.marketing_schedules_missing_jobs TO service_role;
