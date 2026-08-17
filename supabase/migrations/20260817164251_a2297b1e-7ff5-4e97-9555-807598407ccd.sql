select cron.schedule(
  'storage-history-scan',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--10831104-572a-4be2-a77b-1e4b87c20f11-dev.lovable.app/api/public/hooks/storage-scan?secret=nJI82mY2pQps9htk8z0JC9GV99PqZD2337K7FWUqk8Y&batch=40',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);