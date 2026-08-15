
-- 允许 anon（移动端）更新平台代金券资金池（settlement 结算时调用）
DROP POLICY IF EXISTS "anon update voucher_pool" ON public.voucher_pool;
CREATE POLICY "anon update voucher_pool"
  ON public.voucher_pool
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 允许 anon 读取 voucher_pool（结算前需 select 当前 accumulated）
DROP POLICY IF EXISTS "anon read voucher_pool" ON public.voucher_pool;
CREATE POLICY "anon read voucher_pool"
  ON public.voucher_pool
  FOR SELECT
  TO anon
  USING (true);
