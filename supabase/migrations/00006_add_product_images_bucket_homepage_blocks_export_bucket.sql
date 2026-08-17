
-- 商品图片存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 'product-images', true, 5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'product-images');
CREATE POLICY "product_images_public_upload" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "product_images_public_delete" ON storage.objects
  FOR DELETE TO public USING (bucket_id = 'product-images');

-- 导出文件存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports', 'exports', true, 52428800,
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "exports_public_upload" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'exports');
CREATE POLICY "exports_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'exports');

-- 首页装修配置表
CREATE TABLE IF NOT EXISTS public.homepage_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL DEFAULT 'banner', -- banner | notice | product
  title       text NOT NULL DEFAULT '',
  subtitle    text NOT NULL DEFAULT '',
  link_path   text NOT NULL DEFAULT '',
  image_url   text NOT NULL DEFAULT '',
  bg_gradient text NOT NULL DEFAULT 'from-primary to-secondary',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.homepage_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homepage_blocks_all" ON public.homepage_blocks FOR ALL USING (true) WITH CHECK (true);

-- 预置3条默认Banner数据
INSERT INTO public.homepage_blocks (type, title, subtitle, link_path, bg_gradient, sort_order, is_active) VALUES
  ('banner', '限时进货', '精选寄卖商品 · 一键下单', '/m/rush', 'from-primary to-secondary', 1, true),
  ('banner', '进货市场', '统一定价 ¥1,688/套 · 品质保障', '/m/market', 'from-accent to-primary', 2, true),
  ('banner', '分销中心', '邀请好友 · 实时奖金结算', '/m/team', 'from-secondary to-accent', 3, true);
