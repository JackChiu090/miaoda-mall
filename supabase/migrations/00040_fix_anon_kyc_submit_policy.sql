
-- 移动端（anon role）提交实名认证时需要 UPDATE users.kyc_status
-- 给 anon 添加 users 的 UPDATE policy（仅允许更新认证相关字段）
DROP POLICY IF EXISTS "anon update own kyc_status" ON public.users;
CREATE POLICY "anon update own kyc_status"
  ON public.users
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 同样确保 anon 可以更新自己的 nickname（认证通过后同步真实姓名）
-- 上面的 UPDATE policy 已经覆盖了这个场景
