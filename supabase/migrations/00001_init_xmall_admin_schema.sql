
-- =============================================
-- X商城管理后台 数据库初始化
-- =============================================

-- 1. 管理员扩展信息表（关联 auth.users）
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'admin',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.admin_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. 平台用户表
CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  nickname text NOT NULL DEFAULT '',
  avatar_url text,
  kyc_status text NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','approved','rejected','unsubmitted')),
  member_level text NOT NULL DEFAULT 'normal' CHECK (member_level IN ('normal','member','captain')),
  invite_code text UNIQUE NOT NULL DEFAULT upper(substr(md5(random()::text),1,8)),
  referrer_id uuid REFERENCES public.users(id),
  is_banned boolean NOT NULL DEFAULT false,
  ban_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon read users" ON public.users FOR SELECT TO anon USING (false);

-- 3. 实名认证申请表
CREATE TABLE public.kyc_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  real_name text NOT NULL,
  id_card_no text NOT NULL,
  front_image_url text,
  back_image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by uuid REFERENCES public.admin_users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kyc_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.kyc_applications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. 会员/团长等级配置
CREATE TABLE public.member_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  min_direct_referrals int NOT NULL DEFAULT 0,
  min_team_depth int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.member_levels FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon read levels" ON public.member_levels FOR SELECT TO anon USING (true);

INSERT INTO public.member_levels (code, name, description, min_direct_referrals, min_team_depth, sort_order) VALUES
  ('normal', '普通用户', '平台普通注册用户', 0, 0, 1),
  ('member', '会员', '认证会员，享受专属权益', 1, 0, 2),
  ('captain', '团长', '直推3人且团队层级达4层', 3, 4, 3);

-- 5. 商品分类
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.product_categories(id),
  icon_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.product_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon read categories" ON public.product_categories FOR SELECT TO anon USING (true);

INSERT INTO public.product_categories (name, sort_order) VALUES
  ('数码电子', 1), ('奢侈品', 2), ('手表珠宝', 3), ('潮流服饰', 4), ('收藏品', 5), ('其他', 99);

-- 6. 系统设置表
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.system_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.system_settings (key, value, description) VALUES
  ('platform_name', 'X商城', '平台名称'),
  ('consignment_fee_rate', '0.015', '代卖费率 1.5%'),
  ('storage_fee_rate', '0.015', '保管费率 1.5%'),
  ('total_commission_rate', '0.03', '整体分润计提比例 3%'),
  ('merchant_bonus_rate', '0.015', '商家分红比例 1.5%'),
  ('boss_bonus_rate', '0.009', '老板分红比例 0.9%'),
  ('voucher_reserve_rate', '0.002', '代金券储备比例 0.2%'),
  ('captain_direct_bonus_rate', '0.004', '组长直推奖比例 0.4%'),
  ('voucher_exchange_threshold', '3367', '代金券储备达到多少元可兑换实物');

-- 7. 商品表
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.users(id),
  category_id uuid REFERENCES public.product_categories(id),
  title text NOT NULL,
  description text,
  images jsonb NOT NULL DEFAULT '[]',
  original_price numeric(12,2) NOT NULL DEFAULT 0,
  consignment_price numeric(12,2) NOT NULL DEFAULT 0,
  consignment_fee numeric(12,2) NOT NULL DEFAULT 0,
  storage_fee numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','sold','withdrawn')),
  reject_reason text,
  reviewed_by uuid REFERENCES public.admin_users(id),
  reviewed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  generation int NOT NULL DEFAULT 1,
  parent_product_id uuid REFERENCES public.products(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. 活动表
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  activity_type text NOT NULL DEFAULT 'flash_sale' CHECK (activity_type IN ('flash_sale','auction')),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','ended','cancelled')),
  created_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. 活动商品关联表
CREATE TABLE public.activity_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  activity_price numeric(12,2) NOT NULL,
  stock int NOT NULL DEFAULT 1,
  sold int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.activity_products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. 订单表
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text UNIQUE NOT NULL,
  buyer_id uuid NOT NULL REFERENCES public.users(id),
  seller_id uuid NOT NULL REFERENCES public.users(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  activity_id uuid REFERENCES public.activities(id),
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment','payment_uploaded','confirmed','completed','cancelled','disputed'
  )),
  payment_voucher_url text,
  payment_time timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 订单号自动生成触发器
CREATE OR REPLACE FUNCTION generate_order_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.order_no := 'ORD' || to_char(now(), 'YYYYMMDD') || lpad(floor(random()*1000000)::text, 6, '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_order_no BEFORE INSERT ON public.orders
FOR EACH ROW WHEN (NEW.order_no IS NULL OR NEW.order_no = '') EXECUTE FUNCTION generate_order_no();

-- 11. 订单状态流转记录
CREATE TABLE public.order_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  operator_type text NOT NULL DEFAULT 'system' CHECK (operator_type IN ('system','buyer','seller','admin')),
  operator_id uuid,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.order_status_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. 转拍/赠送记录
CREATE TABLE public.transfer_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('resell','gift')),
  from_order_id uuid NOT NULL REFERENCES public.orders(id),
  new_order_id uuid REFERENCES public.orders(id),
  from_user_id uuid NOT NULL REFERENCES public.users(id),
  to_user_id uuid REFERENCES public.users(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transfer_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.transfer_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. 虚拟账户表（每用户5个账户）
CREATE TABLE public.virtual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_type text NOT NULL CHECK (account_type IN ('bonus','balance','points','coupon','promotion')),
  balance numeric(14,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_in numeric(14,4) NOT NULL DEFAULT 0,
  total_out numeric(14,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_type)
);
ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.virtual_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. 账户流水表
CREATE TABLE public.account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.virtual_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  account_type text NOT NULL,
  type text NOT NULL CHECK (type IN ('in','out','freeze','unfreeze')),
  amount numeric(14,4) NOT NULL,
  balance_after numeric(14,4) NOT NULL,
  related_order_id uuid REFERENCES public.orders(id),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.account_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 15. 提现申请表
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  account_type text NOT NULL CHECK (account_type IN ('points','promotion')),
  amount numeric(14,4) NOT NULL CHECK (amount > 0),
  bank_name text,
  bank_account text,
  bank_holder text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  reject_reason text,
  reviewed_by uuid REFERENCES public.admin_users(id),
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.withdrawal_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 16. 优惠券模板表
CREATE TABLE public.coupon_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  face_value numeric(12,2) NOT NULL,
  min_amount numeric(12,2) NOT NULL DEFAULT 0,
  valid_days int NOT NULL DEFAULT 30,
  total_count int NOT NULL DEFAULT 0,
  issued_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupon_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.coupon_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 17. 用户优惠券表
CREATE TABLE public.user_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  template_id uuid NOT NULL REFERENCES public.coupon_templates(id),
  face_value numeric(12,2) NOT NULL,
  expired_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','used','expired')),
  used_at timestamptz,
  used_order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.user_coupons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 18. 代金券资金池
CREATE TABLE public.voucher_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accumulated numeric(14,4) NOT NULL DEFAULT 0,
  threshold numeric(14,4) NOT NULL DEFAULT 3367,
  total_exchanged_count int NOT NULL DEFAULT 0,
  last_exchange_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voucher_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.voucher_pool FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.voucher_pool (accumulated, threshold) VALUES (0, 3367);

-- 19. 分销关系表
CREATE TABLE public.distribution_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  parent_id uuid REFERENCES public.users(id),
  level int NOT NULL DEFAULT 1,
  path text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
ALTER TABLE public.distribution_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.distribution_relations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 20. 分销奖金结算记录
CREATE TABLE public.commission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_amount numeric(12,2) NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.users(id),
  commission_type text NOT NULL CHECK (commission_type IN ('merchant_bonus','boss_bonus','captain_direct','voucher_reserve')),
  rate numeric(6,4) NOT NULL,
  amount numeric(14,4) NOT NULL,
  status text NOT NULL DEFAULT 'settled' CHECK (status IN ('settled','pending','failed')),
  settled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.commission_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 21. 公告通知表
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  type text NOT NULL DEFAULT 'notice' CHECK (type IN ('notice','promotion','system')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','withdrawn')),
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_by uuid REFERENCES public.admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.announcements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 22. 平台协议表
CREATE TABLE public.platform_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1.0',
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.admin_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.platform_agreements FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.platform_agreements (code, title, version) VALUES
  ('user_agreement', '用户服务协议', '1.0'),
  ('privacy_policy', '隐私政策', '1.0'),
  ('consignment_rules', '寄卖规则', '1.0'),
  ('distribution_rules', '分销规则', '1.0');

-- 23. 消息通知表
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id),
  title text NOT NULL,
  content text NOT NULL,
  type text NOT NULL DEFAULT 'system' CHECK (type IN ('system','order','account','promotion')),
  is_read boolean NOT NULL DEFAULT false,
  is_broadcast boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 24. 收款账户绑定
CREATE TABLE public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_type text NOT NULL CHECK (account_type IN ('bank','alipay','wechat')),
  account_no text NOT NULL,
  account_name text NOT NULL,
  bank_name text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access" ON public.payment_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 种子数据：demo users
INSERT INTO public.users (phone, nickname, kyc_status, member_level, invite_code) VALUES
  ('13800000001', '张三', 'approved', 'captain', 'INV00001'),
  ('13800000002', '李四', 'approved', 'member', 'INV00002'),
  ('13800000003', '王五', 'pending', 'normal', 'INV00003'),
  ('13800000004', '赵六', 'approved', 'member', 'INV00004'),
  ('13800000005', '钱七', 'unsubmitted', 'normal', 'INV00005');
