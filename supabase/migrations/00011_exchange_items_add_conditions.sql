
-- 给兑换商品加两个前置兑换条件字段
ALTER TABLE exchange_items
  ADD COLUMN IF NOT EXISTS min_coupon_balance  integer NOT NULL DEFAULT 3776,
  ADD COLUMN IF NOT EXISTS min_direct_referrals integer NOT NULL DEFAULT 3;

-- 更新已有示例数据使用默认值（已由 DEFAULT 覆盖，无需手动更新）
COMMENT ON COLUMN exchange_items.min_coupon_balance   IS '兑换前置：优惠券余额须≥该值';
COMMENT ON COLUMN exchange_items.min_direct_referrals IS '兑换前置：直接推荐人数须≥该值';
