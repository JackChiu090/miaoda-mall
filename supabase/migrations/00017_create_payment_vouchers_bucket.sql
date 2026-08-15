
-- 创建 payment-vouchers 存储桶（公开访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-vouchers',
  'payment-vouchers',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 允许已登录用户上传
CREATE POLICY "用户可上传支付凭证" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'payment-vouchers');

-- 允许公开读取
CREATE POLICY "公开读取支付凭证" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'payment-vouchers');
