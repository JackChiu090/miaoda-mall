
-- 管理员档案表（扩展 Supabase Auth 用户）
CREATE TABLE admin_profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  role         text NOT NULL DEFAULT 'customer_service'
                 CHECK (role IN ('super_admin', 'operator', 'customer_service')),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- 已登录管理员均可查询所有档案（用于侧边栏显示角色）
CREATE POLICY "admin_profiles_select"
  ON admin_profiles FOR SELECT
  TO authenticated
  USING (true);

-- 只有超级管理员可以插入新管理员档案
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
$$;

CREATE POLICY "admin_profiles_insert"
  ON admin_profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "admin_profiles_update"
  ON admin_profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "admin_profiles_delete"
  ON admin_profiles FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER admin_profiles_updated_at
  BEFORE UPDATE ON admin_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
