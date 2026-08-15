
-- 启用 pg_cron 和 pg_net 扩展
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 注册定时任务：每天 09:29 北京时间（= 01:29 UTC），仅周一～周五
-- cron 表达式：分 时 日 月 星期（1-5 = 周一～周五）
SELECT cron.schedule(
  'auto-rush-order-daily',
  '29 1 * * 1-5',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/auto-rush-order',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'publishable_key')
    ),
    body := concat('{"triggered_by":"cron","time":"', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
