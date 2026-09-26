SELECT cron.unschedule('storage-history-scan');
SELECT cron.unschedule('metadata-backfill');
SELECT cron.unschedule('tmdb-backfill');
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days';
SELECT cron.schedule('purge-cron-history', '41 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days'$$);
CREATE INDEX IF NOT EXISTS movies_metadata_version_idx ON public.movies (metadata_version);