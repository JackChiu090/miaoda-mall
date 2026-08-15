-- 创建 user_accounts 视图，映射 virtual_accounts 并补充 frozen_balance 列
CREATE OR REPLACE VIEW public.user_accounts AS
  SELECT
    id,
    user_id,
    account_type,
    balance,
    0::numeric(14,4) AS frozen_balance,
    total_in,
    total_out,
    updated_at
  FROM public.virtual_accounts;

-- PostgREST 需要 SECURITY DEFINER 函数或直接对视图授权
GRANT SELECT, INSERT, UPDATE ON public.user_accounts TO anon, authenticated;
