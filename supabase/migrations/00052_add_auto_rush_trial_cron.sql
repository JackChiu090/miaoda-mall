
-- 注册体验商家自动进货定时任务：每天 09:30 北京时间（= 01:30 UTC），仅周一～周五
SELECT cron.schedule(
  'auto-rush-trial-daily',
  '30 1 * * 1-5',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/auto-rush-trial',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'publishable_key')
    ),
    body := concat('{"triggered_by":"cron","time":"', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
