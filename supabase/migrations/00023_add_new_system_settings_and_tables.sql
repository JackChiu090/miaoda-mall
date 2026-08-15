
-- 插入/更新新配置参数
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('resell_premium_rate',           '0.03',  now()),
  ('direct_referral_rate',          '0.02',  now()),
  ('eat_soil_rate',                 '0.05',  now()),
  ('new_user_eat_soil_days',        '5',     now()),
  ('merchant_bonus_rate',           '0.01',  now()),
  ('boss_bonus_rate',               '0.017', now()),
  ('voucher_reserve_rate',          '0.001', now()),
  ('voucher_pool_redeem_threshold', '3980',  now()),
  ('voucher_min_direct_referrals',  '3',     now()),
  ('rush_display_hour',             '9',     now())
ON CONFLICT (key) DO UPDATE SET
  value      = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;

-- 代金券兑换申请表（积分商城后台审核）
CREATE TABLE IF NOT EXISTS voucher_redeem_requests (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id),
  amount         numeric NOT NULL DEFAULT 0,
  pool_snapshot  numeric NOT NULL DEFAULT 0,
  direct_count   int NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason  text,
  reviewer_note  text,
  reviewed_at    timestamptz,
  created_at     timestamptz DEFAULT now()
);

-- activities 表增加每日展示开始时间字段
ALTER TABLE activities ADD COLUMN IF NOT EXISTS display_from_time time DEFAULT '09:00:00';
