
-- SECURITY DEFINER 函数：检查身份证号是否已被其他账号绑定
-- 返回 true = 已被占用，false = 可以使用
CREATE OR REPLACE FUNCTION public.check_id_card_taken(
  p_id_card_no text,
  p_user_id    uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id_card_no = p_id_card_no
      AND id <> p_user_id
      AND id_card_no IS NOT NULL
  );
$$;
