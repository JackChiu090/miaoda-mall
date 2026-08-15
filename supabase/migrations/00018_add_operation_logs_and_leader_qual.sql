
-- 管理员操作日志表
CREATE TABLE IF NOT EXISTS public.admin_operation_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_account   text,
  action_type     text NOT NULL,
  target_type     text,
  target_id       text,
  detail          text,
  ip              text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_operation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read operation logs" ON public.admin_operation_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert operation logs" ON public.admin_operation_logs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON public.admin_operation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON public.admin_operation_logs(action_type);

-- 组长直推奖达标审核表
CREATE TABLE IF NOT EXISTS public.leader_qualification_reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES public.users(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  horizontal_count    int DEFAULT 0,
  vertical_count      int DEFAULT 0,
  reviewed_by         text,
  reviewed_at         timestamptz,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leader_qualification_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage leader reviews" ON public.leader_qualification_reviews
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_leader_qual_user ON public.leader_qualification_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_leader_qual_status ON public.leader_qualification_reviews(status);

-- 为 orders 表添加 voucher_flagged 字段（凭证标记为可疑）
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS voucher_flagged boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS voucher_flag_note text;
