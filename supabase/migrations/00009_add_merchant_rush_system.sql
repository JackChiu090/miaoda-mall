
-- 1. 商家类型字段（体验/正式）+ 连续未进货计数
ALTER TABLE users
  ADD COLUMN merchant_type text NOT NULL DEFAULT 'trial' CHECK (merchant_type IN ('trial','regular')),
  ADD COLUMN consecutive_missed integer NOT NULL DEFAULT 0;

-- 2. 9:29 体验商家抢单资格表
CREATE TABLE rush_early_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by_admin text,
  added_at timestamptz NOT NULL DEFAULT now(),
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  notes text,
  UNIQUE (user_id)
);
ALTER TABLE rush_early_access ENABLE ROW LEVEL SECURITY;

-- 管理员可全量读写
CREATE POLICY "admin full access rush_early_access"
  ON rush_early_access FOR ALL USING (true) WITH CHECK (true);

-- 用户可查询自身资格
CREATE POLICY "user read own rush access"
  ON rush_early_access FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE id = rush_early_access.user_id LIMIT 1));

-- 3. orders 表补充"转拍"状态和相关字段
ALTER TABLE orders
  ADD COLUMN resell_price numeric,
  ADD COLUMN resell_at timestamptz,
  ADD COLUMN is_resell boolean NOT NULL DEFAULT false;

-- status 新增 'resell_listed'（已转拍上架）
-- 通过 CHECK 约束扩展（先删除旧约束如有）
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending_payment','payment_uploaded','confirmed',
    'completed','cancelled','disputed','resell_listed'
  ));

-- 4. RLS：rush_early_access 已在上方创建

-- 5. 函数：连续未进货检测 → 自动标记体验商家
CREATE OR REPLACE FUNCTION mark_trial_merchants()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 连续2次以上未进货 → 重置为体验商家
  UPDATE users
    SET merchant_type = 'trial', consecutive_missed = consecutive_missed + 1
  WHERE id IN (
    SELECT u.id FROM users u
    WHERE u.merchant_type = 'regular'
      AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.buyer_id = u.id
          AND o.created_at >= now() - interval '2 days'
          AND o.status NOT IN ('cancelled')
      )
  );
END;
$$;

-- 6. products 表补充 origin_order_id（转拍来源订单）
ALTER TABLE products
  ADD COLUMN origin_order_id uuid REFERENCES orders(id),
  ADD COLUMN is_resell boolean NOT NULL DEFAULT false,
  ADD COLUMN resell_premium_rate numeric NOT NULL DEFAULT 0.03;
