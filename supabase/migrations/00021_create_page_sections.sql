
CREATE TABLE IF NOT EXISTS page_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key  text UNIQUE NOT NULL,
  title        text NOT NULL DEFAULT '',
  subtitle     text NOT NULL DEFAULT '',
  is_visible   boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  config       jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed default sections
INSERT INTO page_sections (section_key, title, subtitle, is_visible, sort_order, config) VALUES
  ('banner_carousel',   'Banner轮播',   '首页顶部图片轮播区域',         true,  1, '{"max_count":5}'),
  ('quick_nav',         '快捷入口',     '功能快捷入口网格',             true,  2, '{}'),
  ('announcements',     '平台公告',     '最新平台公告列表',             true,  3, '{"max_count":3}'),
  ('activities',        '近期活动',     '正在进行中的活动',             true,  4, '{"max_count":4}'),
  ('featured_products', '甄选新品',     '精选上架商品展示',             true,  5, '{"max_count":4,"cols":2}'),
  ('exchange_zone',     '积分兑换专区', '积分商城入口及商品预览',        true,  6, '{"max_count":4}'),
  ('login_guide',       '登录引导',     '未登录用户引导条',             true,  7, '{}')
ON CONFLICT (section_key) DO NOTHING;

-- RLS
ALTER TABLE page_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all" ON page_sections FOR ALL USING (true) WITH CHECK (true);
