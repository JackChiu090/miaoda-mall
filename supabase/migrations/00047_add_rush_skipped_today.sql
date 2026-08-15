
ALTER TABLE users ADD COLUMN IF NOT EXISTS rush_skipped_today boolean NOT NULL DEFAULT false;

INSERT INTO system_settings (key, value) VALUES
  ('rush_early_max_trial', '1')
ON CONFLICT (key) DO NOTHING;

UPDATE system_settings SET value = '2' WHERE key = 'rush_early_max';
