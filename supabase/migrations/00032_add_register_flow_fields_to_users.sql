
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS real_name       text,
  ADD COLUMN IF NOT EXISTS id_card_no      text,
  ADD COLUMN IF NOT EXISTS signature_data  text,
  ADD COLUMN IF NOT EXISTS register_step   smallint DEFAULT 0;
