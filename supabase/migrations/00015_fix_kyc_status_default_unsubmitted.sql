
-- 1. 将 kyc_status 默认值从 'pending' 改为 'unsubmitted'
ALTER TABLE public.users
  ALTER COLUMN kyc_status SET DEFAULT 'unsubmitted';

-- 2. 将"显示pending但从未提交过认证申请"的用户修正为 unsubmitted
--    （有提交记录的保持 pending 不变）
UPDATE public.users u
SET kyc_status = 'unsubmitted'
WHERE u.kyc_status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.kyc_applications k
    WHERE k.user_id = u.id
  );
