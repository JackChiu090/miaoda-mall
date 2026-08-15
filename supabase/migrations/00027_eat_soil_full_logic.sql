
-- 1. screening_records 新增字段
ALTER TABLE screening_records
  ADD COLUMN IF NOT EXISTS deducted_amount  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_restored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expires_at        timestamptz,
  ADD COLUMN IF NOT EXISTS expired           boolean NOT NULL DEFAULT false;

-- 2. users 新增字段
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_referral_order_at timestamptz,
  ADD COLUMN IF NOT EXISTS eat_soil_deducted       boolean NOT NULL DEFAULT false;

-- 3. system_settings 新增参数（ON CONFLICT DO NOTHING 防重复）
INSERT INTO system_settings (key, value, description) VALUES
  ('eat_soil_min_active_users',    '20',   '吃土机制最小活跃用户数门槛'),
  ('eat_soil_deduct_rate',         '0.5',  '吃土扣款比例（总余额的50%）'),
  ('eat_soil_recover_days',        '3',    '吃土用户宽限期：N天内下单可恢复，否则永久扣款'),
  ('eat_soil_freeze_referral_days','20',   '连续N天未推荐新人下单则冻结账户')
ON CONFLICT (key) DO NOTHING;
