
-- 1. kyc_applications 补充字段：ocr 识别结果、自动审核标记、提交来源IP
ALTER TABLE kyc_applications
  ADD COLUMN IF NOT EXISTS ocr_result       jsonb,
  ADD COLUMN IF NOT EXISTS auto_verified    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_verify_msg  text,
  ADD COLUMN IF NOT EXISTS submitted_at     timestamptz NOT NULL DEFAULT now();

-- 2. 创建身份证图片存储桶（公开读，管理员写）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'id-card-images',
  'id-card-images',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS：允许任何人上传到 id-card-images
CREATE POLICY "allow_upload_id_card"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'id-card-images');

CREATE POLICY "allow_read_id_card"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'id-card-images');

CREATE POLICY "allow_update_id_card"
  ON storage.objects FOR UPDATE
  TO public
  USING (bucket_id = 'id-card-images');

-- 4. kyc_applications RLS（若未开启先开启）
ALTER TABLE kyc_applications ENABLE ROW LEVEL SECURITY;

-- 允许用户查看自己的认证申请
DROP POLICY IF EXISTS "users_select_own_kyc" ON kyc_applications;
CREATE POLICY "users_select_own_kyc"
  ON kyc_applications FOR SELECT
  TO public
  USING (true);

-- 允许用户插入自己的认证申请
DROP POLICY IF EXISTS "users_insert_kyc" ON kyc_applications;
CREATE POLICY "users_insert_kyc"
  ON kyc_applications FOR INSERT
  TO public
  WITH CHECK (true);

-- 允许更新（管理员审核用）
DROP POLICY IF EXISTS "admin_update_kyc" ON kyc_applications;
CREATE POLICY "admin_update_kyc"
  ON kyc_applications FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- 5. 为后台审核加索引
CREATE INDEX IF NOT EXISTS idx_kyc_applications_status ON kyc_applications (status);
CREATE INDEX IF NOT EXISTS idx_kyc_applications_user_id ON kyc_applications (user_id);
