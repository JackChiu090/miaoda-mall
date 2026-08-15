
INSERT INTO system_settings (key, value, description) VALUES
  ('market_open_hour',    '9',  '进货市场每天开市时间（小时，0-23）'),
  ('market_open_minute',  '0',  '进货市场每天开市时间（分钟，0-59）'),
  ('resell_cutoff_hour',  '14', '转拍截止计算基准时间（小时）'),
  ('resell_cutoff_minute','20', '转拍截止计算基准时间（分钟）')
ON CONFLICT (key) DO NOTHING;
