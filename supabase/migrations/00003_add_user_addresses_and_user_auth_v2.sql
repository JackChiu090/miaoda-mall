
-- 用户收货地址表
CREATE TABLE IF NOT EXISTS public.user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_name text NOT NULL,
  phone text NOT NULL,
  province text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_addresses' AND policyname='admin full access') THEN
    CREATE POLICY "admin full access" ON public.user_addresses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_addresses' AND policyname='anon write user_addresses') THEN
    CREATE POLICY "anon write user_addresses" ON public.user_addresses FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 移动端用户会话表
CREATE TABLE IF NOT EXISTS public.mobile_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mobile_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mobile_sessions' AND policyname='admin full access') THEN
    CREATE POLICY "admin full access" ON public.mobile_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mobile_sessions' AND policyname='anon full access') THEN
    CREATE POLICY "anon full access" ON public.mobile_sessions FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 更新 users anon policy
DROP POLICY IF EXISTS "anon read users" ON public.users;
CREATE POLICY "anon read users" ON public.users FOR SELECT TO anon USING (true);

-- 为各表按需添加 anon policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='anon read products') THEN
    CREATE POLICY "anon read products" ON public.products FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='anon write products') THEN
    CREATE POLICY "anon write products" ON public.products FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activities' AND policyname='anon read activities') THEN
    CREATE POLICY "anon read activities" ON public.activities FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='activity_products' AND policyname='anon read activity_products') THEN
    CREATE POLICY "anon read activity_products" ON public.activity_products FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='announcements' AND policyname='anon read announcements') THEN
    CREATE POLICY "anon read announcements" ON public.announcements FOR SELECT TO anon USING (status = 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='platform_agreements' AND policyname='anon read agreements') THEN
    CREATE POLICY "anon read agreements" ON public.platform_agreements FOR SELECT TO anon USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='anon write users') THEN
    CREATE POLICY "anon write users" ON public.users FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='kyc_applications' AND policyname='anon write kyc') THEN
    CREATE POLICY "anon write kyc" ON public.kyc_applications FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='anon write orders') THEN
    CREATE POLICY "anon write orders" ON public.orders FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_status_logs' AND policyname='anon read order_logs') THEN
    CREATE POLICY "anon read order_logs" ON public.order_status_logs FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_status_logs' AND policyname='anon write order_logs') THEN
    CREATE POLICY "anon write order_logs" ON public.order_status_logs FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='virtual_accounts' AND policyname='anon read virtual_accounts') THEN
    CREATE POLICY "anon read virtual_accounts" ON public.virtual_accounts FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='virtual_accounts' AND policyname='anon write virtual_accounts') THEN
    CREATE POLICY "anon write virtual_accounts" ON public.virtual_accounts FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='account_transactions' AND policyname='anon read transactions') THEN
    CREATE POLICY "anon read transactions" ON public.account_transactions FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='withdrawal_requests' AND policyname='anon write withdrawal') THEN
    CREATE POLICY "anon write withdrawal" ON public.withdrawal_requests FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commission_records' AND policyname='anon read commission') THEN
    CREATE POLICY "anon read commission" ON public.commission_records FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='distribution_relations' AND policyname='anon read distribution') THEN
    CREATE POLICY "anon read distribution" ON public.distribution_relations FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='distribution_relations' AND policyname='anon write distribution') THEN
    CREATE POLICY "anon write distribution" ON public.distribution_relations FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='anon read notifications') THEN
    CREATE POLICY "anon read notifications" ON public.notifications FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payment_accounts' AND policyname='anon write payment_accounts') THEN
    CREATE POLICY "anon write payment_accounts" ON public.payment_accounts FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
