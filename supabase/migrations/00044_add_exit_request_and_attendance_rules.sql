-- 添加退出申请时间字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS exit_request_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS exit_request_note TEXT;

-- 插入新的抢购规则系统参数
INSERT INTO system_settings (key, value) VALUES
  ('trial_required_days',    '15'),   -- 体验商家每天必须抢购，最多15个工作日
  ('trial_daily_rush_min',   '1'),    -- 体验商家每日抢购下限
  ('trial_daily_rush_max',   '2'),    -- 体验商家每日抢购上限
  ('regular_daily_rush_min', '2'),    -- 正式商家每日抢购下限
  ('early_rush_start_hour',  '9'),    -- 9:29 早场开放小时
  ('early_rush_start_min',   '29'),   -- 9:29 早场开放分钟
  ('main_rush_start_hour',   '9'),    -- 9:30 主场开放小时
  ('main_rush_start_min',    '30')    -- 9:30 主场开放分钟
ON CONFLICT (key) DO NOTHING;