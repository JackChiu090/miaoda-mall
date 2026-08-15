
-- 插入6类协议
INSERT INTO platform_agreements (code, title, content, version, is_active, updated_at) VALUES
  ('register_agreement',  '注册协议',          '请在此填写注册协议内容。', 'v1.0', true, NOW()),
  ('privacy_policy',      '隐私协议',          '请在此填写隐私协议内容。', 'v1.0', true, NOW()),
  ('user_notice',         '用户须知',          '请在此填写用户须知内容。', 'v1.0', true, NOW()),
  ('c2c_payment_risk',    'C2C个人支付风险须知','请在此填写C2C个人支付风险须知内容。', 'v1.0', true, NOW()),
  ('entrust_service',     '委托服务协议',      '请在此填写委托服务协议内容。', 'v1.0', true, NOW()),
  ('sign_agreement',      '签约协议',          '请在此填写签约协议内容。', 'v1.0', true, NOW())
ON CONFLICT (code) DO NOTHING;

-- 抢购时段配置
INSERT INTO system_settings (key, value, description) VALUES
  ('market_buy_start_hour',   '9',  '抢购开始时间（小时）'),
  ('market_buy_start_minute', '30', '抢购开始时间（分钟）'),
  ('market_buy_end_hour',     '9',  '抢购结束时间（小时）'),
  ('market_buy_end_minute',   '35', '抢购结束时间（分钟）')
ON CONFLICT (key) DO NOTHING;
