-- 00067: 商家类型判断改为推荐关系驱动
-- 正式商家：推广 ≥1 个商家（不管是否完成订单交易）
-- 体验商家：0 推广（注册起 15 个工作日内未推广，参数 trial_required_days 可调）

-- 1. 触发器：有推荐关系建立（新用户注册带 referrer_id 或改 referrer_id）时，将推荐人升级为正式商家
CREATE OR REPLACE FUNCTION public.promote_referrer_to_regular() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.referrer_id IS NOT NULL THEN
    UPDATE public.users
      SET merchant_type = 'regular'
    WHERE id = NEW.referrer_id
      AND merchant_type <> 'regular';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_referrer ON public.users;
CREATE TRIGGER trg_promote_referrer
AFTER INSERT OR UPDATE OF referrer_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.promote_referrer_to_regular();

-- 2. 一次性重算现有用户商家类型（老板 is_super_admin 恒为正式商家）
UPDATE public.users u SET merchant_type = CASE
  WHEN u.is_super_admin = true THEN 'regular'
  WHEN EXISTS (SELECT 1 FROM public.users r WHERE r.referrer_id = u.id) THEN 'regular'
  ELSE 'trial'
END;

-- 3. 重写 mark_trial_merchants：无任何推荐关系的正式商家 → 降级为体验商家（老板除外）
CREATE OR REPLACE FUNCTION public.mark_trial_merchants() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users u SET merchant_type = 'trial'
  WHERE u.merchant_type = 'regular'
    AND u.is_super_admin = false
    AND NOT EXISTS (SELECT 1 FROM public.users r WHERE r.referrer_id = u.id);
END;
$$;
