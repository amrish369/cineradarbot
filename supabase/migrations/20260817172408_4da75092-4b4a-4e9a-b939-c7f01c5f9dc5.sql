select cron.unschedule('metadata-backfill') where exists (select 1 from cron.job where jobname = 'metadata-backfill');

select cron.schedule(
  'metadata-backfill',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://project--10831104-572a-4be2-a77b-1e4b87c20f11-dev.lovable.app/api/public/hooks/metadata-backfill?batch=25',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-hook-secret', (select value #>> '{}' from public.bot_settings where key = 'hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);