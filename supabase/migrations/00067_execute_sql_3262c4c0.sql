-- 停用自动抢单定时任务
SELECT cron.unschedule('auto-rush-order-daily');
SELECT cron.unschedule('auto-rush-trial-daily');