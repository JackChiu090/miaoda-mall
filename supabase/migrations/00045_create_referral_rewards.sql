-- 推荐奖励记录表
CREATE TABLE referral_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id        uuid NOT NULL REFERENCES users(id),   -- 买单触发者
  recipient_id    uuid NOT NULL REFERENCES users(id),   -- 获奖推荐人
  skipped_ids     uuid[] NOT NULL DEFAULT '{}',          -- 被跳过的中间层 user_id 列表
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'settled',       -- settled / cancelled
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- 后台管理员可全量读写
CREATE POLICY "admin_all_referral_rewards" ON referral_rewards
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 用户只能看自己收到的奖励
CREATE POLICY "user_view_own_referral_rewards" ON referral_rewards
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- 插入推荐奖励金额配置（若已存在则不变）
INSERT INTO system_settings (key, value) VALUES ('referral_reward_amount', '50')
ON CONFLICT (key) DO NOTHING;

-- 创建索引
CREATE INDEX idx_referral_rewards_order_id    ON referral_rewards(order_id);
CREATE INDEX idx_referral_rewards_recipient   ON referral_rewards(recipient_id);
CREATE INDEX idx_referral_rewards_buyer       ON referral_rewards(buyer_id);