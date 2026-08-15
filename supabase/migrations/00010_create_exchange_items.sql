
-- 积分兑换商品表
CREATE TABLE IF NOT EXISTS exchange_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  image_url     text,
  points_cost   integer NOT NULL CHECK (points_cost > 0),
  stock         integer NOT NULL DEFAULT 0,
  exchanged     integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 积分兑换申请记录表
CREATE TABLE IF NOT EXISTS exchange_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES exchange_items(id) ON DELETE RESTRICT,
  points_spent    integer NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','shipped','completed','rejected')),
  remark          text,
  reviewed_by     text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE exchange_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exchange_items_public_read" ON exchange_items FOR SELECT USING (true);
CREATE POLICY "exchange_items_admin_all"   ON exchange_items FOR ALL USING (true);
CREATE POLICY "exchange_orders_user_own"   ON exchange_orders FOR SELECT USING (true);
CREATE POLICY "exchange_orders_admin_all"  ON exchange_orders FOR ALL USING (true);

-- 示例商品
INSERT INTO exchange_items (name, description, points_cost, stock, sort_order) VALUES
  ('精品茶叶礼盒',    '精选高山茶叶，独立包装礼盒', 500,  50, 1),
  ('品牌保温杯',      '500ml不锈钢真空保温杯',       800,  30, 2),
  ('超市购物卡100元', '全国通用超市购物卡',           1000, 100, 3),
  ('无线蓝牙耳机',    '入耳式降噪蓝牙耳机',           3000, 20, 4)
ON CONFLICT DO NOTHING;
