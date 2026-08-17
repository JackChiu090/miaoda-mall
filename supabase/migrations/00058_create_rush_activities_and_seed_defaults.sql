-- ── 自定义进货活动表（覆盖默认时段）──
CREATE TABLE public.rush_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  activity_date date NOT NULL,
  start_minute int NOT NULL,
  end_minute int NOT NULL,
  session_type text NOT NULL DEFAULT 'formal' CHECK (session_type IN ('early','formal')),
  stock_limit int NOT NULL DEFAULT 0,
  price_discount numeric NOT NULL DEFAULT 1,
  priority int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rush_activities ENABLE ROW LEVEL SECURITY;

-- 所有人可读（前端需展示当前生效活动）
CREATE POLICY "rush_activities_select_all" ON public.rush_activities
  FOR SELECT TO anon, authenticated USING (true);

-- 仅超级管理员可写
CREATE POLICY "rush_activities_admin_write" ON public.rush_activities
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_super_admin = true));

-- ── orders 关联自定义活动（与 rush_slot_id 二选一）──
ALTER TABLE public.orders
  ADD COLUMN rush_activity_id uuid REFERENCES public.rush_activities(id) ON DELETE SET NULL;

-- ── 种子默认进货时段（仅当 rush_time_slots 为空时）──
INSERT INTO public.rush_time_slots (name, start_minute, end_minute, session_type, stock_limit, price_discount, priority, is_active)
SELECT v.name, v.start_minute, v.end_minute, v.session_type::text, v.stock_limit, v.price_discount::numeric, v.priority, v.is_active
FROM (VALUES
  ('早场', 565, 570, 'early', 2, 1.0, 1, true),
  ('主场', 570, 575, 'formal', 3, 1.0, 2, true)
) AS v(name, start_minute, end_minute, session_type, stock_limit, price_discount, priority, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.rush_time_slots);