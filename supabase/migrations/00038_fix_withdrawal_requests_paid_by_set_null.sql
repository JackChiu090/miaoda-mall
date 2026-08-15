
-- 修复 withdrawal_requests.paid_by 的 NO ACTION → SET NULL
-- 删除用户（管理员）时保留提现记录，审核人字段置空
ALTER TABLE public.withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_paid_by_fkey;
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_paid_by_fkey
    FOREIGN KEY (paid_by) REFERENCES public.users(id) ON DELETE SET NULL;
