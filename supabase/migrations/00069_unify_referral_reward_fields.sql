-- 00069: 统一"直接奖励"与"早市激励"为同一笔奖金，奖励记录统一到 referral_rewards
-- 给 referral_rewards 补充 上级层级(recipient_level) 与 奖励比例(reward_rate) 字段

ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS recipient_level integer,
  ADD COLUMN IF NOT EXISTS reward_rate numeric;
