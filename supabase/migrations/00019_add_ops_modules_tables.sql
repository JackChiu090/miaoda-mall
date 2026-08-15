
-- ============================================================
-- 1. system_configs 运营参数配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS system_configs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL UNIQUE,
  config_value  text NOT NULL,
  value_type    text NOT NULL DEFAULT 'string',  -- string | number | json | boolean
  label         text NOT NULL,
  description   text,
  group_name    text NOT NULL DEFAULT 'general',
  sort_order    int  NOT NULL DEFAULT 0,
  updated_by    text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 初始化默认运营参数
INSERT INTO system_configs (config_key, config_value, value_type, label, description, group_name, sort_order) VALUES
  ('trial_period_days',           '5',    'number',  '体验期天数',           '新用户注册后的体验期天数（3~7天）', 'assessment', 10),
  ('assessment_min_orders',       '1',    'number',  '考核最少完成交易数',   '体验期内需完成的最少交易单数',       'assessment', 20),
  ('assessment_min_invites',      '0',    'number',  '考核最少招商人数',     '体验期内需成功邀请的最少人数',       'assessment', 30),
  ('screening_ratio_min',         '0.20', 'number',  '吃土筛选最低比例',    '每日吃土筛选活跃用户最低比例',       'screening',  10),
  ('screening_ratio_max',         '0.40', 'number',  '吃土筛选最高比例',    '每日吃土筛选活跃用户最高比例',       'screening',  20),
  ('screening_enabled',           'true', 'boolean', '吃土筛选开关',        '是否启用每日吃土筛选任务',           'screening',  5),
  ('elimination_inactive_days',   '30',   'number',  '淘汰判定未登录天数',  '超过N天未登录列入淘汰扫描',          'elimination',10),
  ('elimination_enabled',         'true', 'boolean', '淘汰清理开关',        '是否启用每周淘汰清理任务',           'elimination', 5),
  ('order_split_threshold',       '30000','number',  '拆单溢价阈值（元）',  '单笔流转溢价达到此金额触发拆单',     'order_split', 10),
  ('order_split_enabled',         'true', 'boolean', '拆单开关',            '是否启用自动拆单',                   'order_split', 5),
  ('team_split_shop_count',       '25',   'number',  '拆人触发商铺数量',    '团队有效商铺满N个触发拆人',          'team_split',  10),
  ('team_split_min_volume',       '100000','number', '拆人触发交易额（元）','团队累计交易额达到此金额才触发拆人', 'team_split',  20),
  ('team_split_enabled',          'true', 'boolean', '拆人开关',            '是否启用自动拆人孵化',               'team_split',  5)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- 2. users 表新增状态字段
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_status      text NOT NULL DEFAULT 'trial'
    CHECK (user_status IN ('trial','active','eliminated','frozen')),
  ADD COLUMN IF NOT EXISTS trial_start_at   timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end_at     timestamptz,
  ADD COLUMN IF NOT EXISTS assessment_status text NOT NULL DEFAULT 'pending'
    CHECK (assessment_status IN ('pending','passed','failed','manual_pass','manual_fail')),
  ADD COLUMN IF NOT EXISTS promoted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS eliminated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS screening_today  boolean NOT NULL DEFAULT false;

-- 为已有老用户补全 trial 时间（避免 null）
UPDATE users SET
  trial_start_at = created_at,
  trial_end_at   = created_at + interval '5 days'
WHERE trial_start_at IS NULL;

-- ============================================================
-- 3. user_assessments 考核记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS user_assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trial_start_at    timestamptz NOT NULL,
  trial_end_at      timestamptz NOT NULL,
  orders_completed  int NOT NULL DEFAULT 0,
  invites_completed int NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','passed','failed','manual_pass','manual_fail')),
  reviewed_by       text,
  reviewed_at       timestamptz,
  review_note       text,
  auto_checked_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_assessments_user_id ON user_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assessments_status  ON user_assessments(status);

-- ============================================================
-- 4. daily_screenings 吃土筛选批次表
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_screenings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_date  date NOT NULL UNIQUE,
  total_active    int  NOT NULL DEFAULT 0,
  screened_count  int  NOT NULL DEFAULT 0,
  ratio_used      numeric(5,4) NOT NULL DEFAULT 0.3,
  status          text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running','completed','failed')),
  triggered_by    text NOT NULL DEFAULT 'cron',
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screening_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id    uuid NOT NULL REFERENCES daily_screenings(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  screened_date   date NOT NULL,
  restored_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_screening_records_user    ON screening_records(user_id);
CREATE INDEX IF NOT EXISTS idx_screening_records_date    ON screening_records(screened_date);
CREATE INDEX IF NOT EXISTS idx_screening_records_batch   ON screening_records(screening_id);

-- ============================================================
-- 5. elimination_records 淘汰记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS elimination_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          text NOT NULL,          -- inactive / no_invite / multi_account / manual
  reason_detail   text,
  eliminated_by   text NOT NULL DEFAULT 'system',
  eliminated_at   timestamptz NOT NULL DEFAULT now(),
  restored_at     timestamptz,
  restored_by     text,
  restore_note    text,
  reassess_status text DEFAULT NULL
    CHECK (reassess_status IS NULL OR reassess_status IN ('pending','approved','rejected')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_elimination_records_user ON elimination_records(user_id);

-- ============================================================
-- 6. order_splits 拆单记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS order_splits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id  uuid NOT NULL,
  split_order_a_id   uuid,
  split_order_b_id   uuid,
  original_amount    numeric(12,2) NOT NULL,
  premium_amount     numeric(12,2) NOT NULL,
  threshold_used     numeric(12,2) NOT NULL,
  triggered_by       text NOT NULL DEFAULT 'system',
  status             text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending','completed','failed')),
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_splits_original ON order_splits(original_order_id);

-- ============================================================
-- 7. team_splits 拆人记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS team_splits (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sub_mall_name      text NOT NULL,
  sub_mall_status    text NOT NULL DEFAULT 'active'
    CHECK (sub_mall_status IN ('active','suspended','closed')),
  team_shop_count    int  NOT NULL DEFAULT 0,
  team_volume        numeric(14,2) NOT NULL DEFAULT 0,
  triggered_by       text NOT NULL DEFAULT 'system',
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_splits_leader ON team_splits(leader_user_id);

-- ============================================================
-- 8. RLS - 仅 service_role 可写，anon 不可读
-- ============================================================
ALTER TABLE system_configs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_screenings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE elimination_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_splits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_splits          ENABLE ROW LEVEL SECURITY;

-- service_role 可操作所有
CREATE POLICY "service_role_all" ON system_configs      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON user_assessments    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON daily_screenings    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON screening_records   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON elimination_records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON order_splits        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON team_splits         FOR ALL TO service_role USING (true) WITH CHECK (true);
