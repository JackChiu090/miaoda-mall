
-- ── Banner 轮播图表 ──
CREATE TABLE IF NOT EXISTS public.banners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url    text NOT NULL DEFAULT '',
  title        text NOT NULL DEFAULT '',
  subtitle     text NOT NULL DEFAULT '',
  link_path    text NOT NULL DEFAULT '',
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_banners" ON public.banners FOR ALL USING (true) WITH CHECK (true);

-- ── Banner 配置表（key-value） ──
CREATE TABLE IF NOT EXISTS public.banner_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

ALTER TABLE public.banner_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_banner_settings" ON public.banner_settings FOR ALL USING (true) WITH CHECK (true);

-- 默认配置：自动播放间隔 3500ms，切换动画 450ms
INSERT INTO public.banner_settings (key, value) VALUES
  ('autoplay_interval',   '3500'),
  ('transition_duration', '450')
ON CONFLICT (key) DO NOTHING;

-- ── Supabase Storage bucket: banners（公开读） ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners', 'banners', true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "banners_public_read"
  ON storage.objects FOR SELECT USING (bucket_id = 'banners');
CREATE POLICY "banners_all_write"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'banners');
CREATE POLICY "banners_all_update"
  ON storage.objects FOR UPDATE USING (bucket_id = 'banners');
CREATE POLICY "banners_all_delete"
  ON storage.objects FOR DELETE USING (bucket_id = 'banners');
