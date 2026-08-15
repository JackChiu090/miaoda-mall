
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- 老板账号标记为 true
UPDATE users SET is_super_admin = true
WHERE id = 'a256890e-d87a-4b90-8158-301007001c23';
