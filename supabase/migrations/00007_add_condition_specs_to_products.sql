-- 商品品相与规格参数字段
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS condition text DEFAULT '全新' CHECK (condition IN ('全新','99新','9.5新','9新','8.5新','8新','7新','其他')),
  ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.condition IS '商品成色：全新/99新/9.5新/9新/8.5新/8新/7新/其他';
COMMENT ON COLUMN public.products.specs IS '商品规格参数，键值对JSON，如 {"品牌":"Apple","型号":"iPhone 15 Pro"}';
