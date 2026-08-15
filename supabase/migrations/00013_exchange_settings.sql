
CREATE TABLE IF NOT EXISTS exchange_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初始化默认banner配置
INSERT INTO exchange_settings (key, value) VALUES
  ('banner_title',    '积分兑换商城'),
  ('banner_subtitle', '用积分换好礼，感谢您的支持与参与'),
  ('banner_image',    ''),
  ('banner_bg_color', '#6366f1')
ON CONFLICT (key) DO NOTHING;
