
-- 进货区订单标记字段
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_rush boolean NOT NULL DEFAULT false;

-- 为现有进货区订单（有 activity_id 的）自动回填 is_rush=true
UPDATE public.orders SET is_rush = true WHERE activity_id IS NOT NULL;

COMMENT ON COLUMN public.orders.is_rush IS '是否为进货区订单（含进货快闪和进货活动），用于判断正式商家升级资格';
