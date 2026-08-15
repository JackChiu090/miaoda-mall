
-- 允许已认证管理员写入 system_configs
CREATE POLICY "authenticated_write_system_configs"
ON public.system_configs
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
