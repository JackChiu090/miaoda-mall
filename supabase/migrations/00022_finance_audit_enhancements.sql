
-- 扩展提现申请表
ALTER TABLE withdrawal_requests
  ADD COLUMN IF NOT EXISTS risk_level    text NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('normal','medium','high')),
  ADD COLUMN IF NOT EXISTS review_stage  text NOT NULL DEFAULT 'pending' CHECK (review_stage IN ('pending','initial_review','secondary_review','final_approval','completed','rejected')),
  ADD COLUMN IF NOT EXISTS review_notes  text,
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS paid_by       uuid REFERENCES auth.users(id);

-- 审核操作日志表（完整审计追踪）
CREATE TABLE IF NOT EXISTS withdrawal_review_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id   uuid NOT NULL REFERENCES withdrawal_requests(id) ON DELETE CASCADE,
  reviewer_id     uuid,
  reviewer_name   text,
  action          text NOT NULL CHECK (action IN ('submit','initial_approve','initial_reject','secondary_approve','secondary_reject','final_approve','final_reject','mark_paid','note_added')),
  stage           text NOT NULL DEFAULT 'pending',
  comment         text,
  amount          numeric,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 风险规则配置表
CREATE TABLE IF NOT EXISTS finance_risk_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key    text UNIQUE NOT NULL,
  rule_name   text NOT NULL,
  threshold   numeric NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 种子数据：默认风险规则
INSERT INTO finance_risk_rules (rule_key, rule_name, threshold, description) VALUES
  ('single_amount_high',  '单笔高额预警',    5000,  '单笔提现金额超过阈值自动标记为高风险'),
  ('single_amount_medium','单笔中额预警',    2000,  '单笔提现金额超过阈值自动标记为中风险'),
  ('freq_7d',             '7天内频繁提现',   3,     '7天内提现次数超过阈值触发风险预警'),
  ('daily_total',         '单日累计提现上限', 10000, '单用户单日累计提现金额超过阈值触发预警')
ON CONFLICT (rule_key) DO NOTHING;

-- 索引
CREATE INDEX IF NOT EXISTS idx_withdrawal_review_logs_withdrawal ON withdrawal_review_logs(withdrawal_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_risk ON withdrawal_requests(risk_level) WHERE risk_level != 'normal';
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_stage ON withdrawal_requests(review_stage);

-- RLS
ALTER TABLE withdrawal_review_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_risk_rules      ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_logs"  ON withdrawal_review_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "admin_all_rules" ON finance_risk_rules      FOR ALL USING (true) WITH CHECK (true);
