
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_resell     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resell_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_resell_at ON products (resell_at DESC) WHERE is_resell = true;
