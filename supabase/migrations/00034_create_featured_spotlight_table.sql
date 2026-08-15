
-- 甄选单品展示表
CREATE TABLE IF NOT EXISTS featured_spotlight (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  subtitle      text,
  description   text,
  highlights    text[] DEFAULT '{}',
  price         numeric(10,2) NOT NULL DEFAULT 0,
  original_price numeric(10,2),
  image_url     text,
  tags          text[] DEFAULT '{}',
  product_id    uuid REFERENCES products(id) ON DELETE SET NULL,
  cta_text      text DEFAULT '立即购买',
  start_time    timestamptz,
  end_time      timestamptz,
  is_active     boolean DEFAULT true,
  sort_order    int DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE featured_spotlight ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_featured_spotlight" ON featured_spotlight FOR ALL USING (true) WITH CHECK (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_featured_spotlight_active ON featured_spotlight(is_active, sort_order);
