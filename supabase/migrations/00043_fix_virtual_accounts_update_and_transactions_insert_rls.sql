
-- ============================================================
-- 修复：virtual_accounts 缺少 anon UPDATE 策略
--       account_transactions 缺少 anon INSERT 策略
-- ============================================================

-- virtual_accounts：anon 可更新余额（addUserAccount 累加）
CREATE POLICY "anon update virtual_accounts" ON virtual_accounts
  FOR UPDATE USING (true) WITH CHECK (true);

-- account_transactions：anon 可插入流水
CREATE POLICY "anon insert transactions" ON account_transactions
  FOR INSERT WITH CHECK (true);
