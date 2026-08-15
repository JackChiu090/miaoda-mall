
-- 允许已登录用户（管理员）读取 system_configs
CREATE POLICY "authenticated_read_system_configs"
  ON system_configs
  FOR SELECT
  TO authenticated
  USING (true);
