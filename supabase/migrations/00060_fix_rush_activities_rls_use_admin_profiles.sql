
-- 修复 rush_activities 写入权限：原策略错误查了 users 表（移动端用户），
-- 管理后台 Auth session 的 uid() 实际对应 admin_profiles.id，故改为查 admin_profiles
DROP POLICY IF EXISTS "rush_activities_admin_write" ON rush_activities;
CREATE POLICY "rush_activities_admin_write" ON rush_activities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles ap
      WHERE ap.id = uid()
        AND ap.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_profiles ap
      WHERE ap.id = uid()
        AND ap.is_active = true
    )
  );

-- 同步修复 rush_time_slots 写入权限：原策略查的是 admin_users 表，
-- 统一改为 admin_profiles（与实际登录 Auth 会话一致）
DROP POLICY IF EXISTS "admins can manage rush_time_slots" ON rush_time_slots;
CREATE POLICY "admins can manage rush_time_slots" ON rush_time_slots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles ap
      WHERE ap.id = uid()
        AND ap.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_profiles ap
      WHERE ap.id = uid()
        AND ap.is_active = true
    )
  );
