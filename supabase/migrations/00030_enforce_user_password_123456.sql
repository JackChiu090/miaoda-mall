-- 平台密码策略：除管理员外，其他所有用户（public.users）的密码只能设置为 123456
CREATE OR REPLACE FUNCTION enforce_user_password_policy()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.password IS NOT NULL AND NEW.password <> '123456' THEN
    RAISE EXCEPTION '非管理员用户密码只能设置为 123456';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_password_policy ON public.users;
CREATE TRIGGER trg_users_password_policy
BEFORE INSERT OR UPDATE OF password ON public.users
FOR EACH ROW EXECUTE FUNCTION enforce_user_password_policy();