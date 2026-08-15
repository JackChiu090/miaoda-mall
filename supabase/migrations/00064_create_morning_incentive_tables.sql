-- 早市商家分级激励配置表（单行配置）
CREATE TABLE public.morning_incentive_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_order_limit integer NOT NULL DEFAULT 1,
  deadline_hour integer NOT NULL DEFAULT 12,
  deadline_minute integer NOT NULL DEFAULT 0,
  reward_rate numeric NOT NULL DEFAULT 0.002,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.morning_incentive_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_select_all" ON public.morning_incentive_config FOR SELECT USING (true);
CREATE POLICY "config_update_admin" ON public.morning_incentive_config FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_super_admin = true)
);

-- 早市激励奖励发放记录表
CREATE TABLE public.morning_reward_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  buyer_id uuid NOT NULL REFERENCES public.users(id),
  reward_amount numeric NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.users(id),
  recipient_level integer NOT NULL,
  reward_rate numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.morning_reward_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reward_select_all" ON public.morning_reward_records FOR SELECT USING (true);
CREATE POLICY "reward_insert_service" ON public.morning_reward_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_morning_reward_recipient ON public.morning_reward_records(recipient_id, created_at DESC);
CREATE INDEX idx_morning_reward_order ON public.morning_reward_records(order_id);

-- 写入默认配置行
INSERT INTO public.morning_incentive_config (first_order_limit, deadline_hour, deadline_minute, reward_rate)
VALUES (1, 12, 0, 0.002);