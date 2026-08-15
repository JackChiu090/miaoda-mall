-- orders.buyer_id / orders.seller_id 需要允许 NULL，
-- 这样 ON DELETE SET NULL 外键约束才能在删除用户时正常工作
ALTER TABLE orders
  ALTER COLUMN buyer_id  DROP NOT NULL,
  ALTER COLUMN seller_id DROP NOT NULL;