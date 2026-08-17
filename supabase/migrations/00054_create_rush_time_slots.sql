-- 进货时段配置表：支持多个时段并行管理与优先级
CREATE TABLE public.rush_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_minute integer NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute integer NOT NULL CHECK (end_minute >= 0 AND end_minute <= 1440),
  stock_limit integer NOT NULL DEFAULT 2 CHECK (stock_limit >= 0),
  price_discount numeric(4,2) NOT NULL DEFAULT 1.00 CHECK (price_discount > 0 AND price_discount <= 1.00),
  priority integer NOT NULL DEFAULT 10 CHECK (priority >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_minute > start_minute)
);

CREATE INDEX idx_rush_time_slots_active_priority ON public.rush_time_slots (is_active, priority);

ALTER TABLE public.rush_time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read rush_time_slots"
  ON public.rush_time_slots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "admins can manage rush_time_slots"
  ON public.rush_time_slots FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = auth.uid() AND a.role = 'super_admin' AND a.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = auth.uid() AND a.role = 'super_admin' AND a.is_active = true
    )
  );

-- 种子数据：早场 09:29-09:30（569-570 分钟）、主场 09:30-09:35（570-575 分钟）
INSERT INTO public.rush_time_slots (name, start_minute, end_minute, stock_limit, price_discount, priority, is_active) VALUES
  ('早场', 569, 570, 2, 1.00, 1, true),
  ('主场', 570, 575, 3, 1.00, 2, true);