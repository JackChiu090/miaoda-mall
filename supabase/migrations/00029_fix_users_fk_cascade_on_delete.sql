
-- 统一修复所有引用 users.id 的 NO ACTION 外键
-- 用户专属记录 → CASCADE（随用户一起删除）
-- 共享业务数据（订单/商品/流水等）→ SET NULL（保留历史，字段置空）

-- 1. distribution_relations (user_id / parent_id) → CASCADE
ALTER TABLE distribution_relations
  DROP CONSTRAINT IF EXISTS distribution_relations_user_id_fkey,
  DROP CONSTRAINT IF EXISTS distribution_relations_parent_id_fkey;
ALTER TABLE distribution_relations
  ADD CONSTRAINT distribution_relations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT distribution_relations_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. commission_records.recipient_id → SET NULL
ALTER TABLE commission_records
  DROP CONSTRAINT IF EXISTS commission_records_recipient_id_fkey;
ALTER TABLE commission_records
  ADD CONSTRAINT commission_records_recipient_id_fkey
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;

-- 3. notifications.user_id → CASCADE
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 4. orders.buyer_id / orders.seller_id → SET NULL（保留订单历史）
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_buyer_id_fkey,
  DROP CONSTRAINT IF EXISTS orders_seller_id_fkey;
ALTER TABLE orders
  ADD CONSTRAINT orders_buyer_id_fkey
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT orders_seller_id_fkey
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL;

-- 5. products.seller_id → SET NULL（保留商品）
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_seller_id_fkey;
ALTER TABLE products
  ADD CONSTRAINT products_seller_id_fkey
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL;

-- 6. account_transactions.user_id → CASCADE
ALTER TABLE account_transactions
  DROP CONSTRAINT IF EXISTS account_transactions_user_id_fkey;
ALTER TABLE account_transactions
  ADD CONSTRAINT account_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 7. transfer_records.from_user_id / to_user_id → SET NULL（保留流水）
ALTER TABLE transfer_records
  DROP CONSTRAINT IF EXISTS transfer_records_from_user_id_fkey,
  DROP CONSTRAINT IF EXISTS transfer_records_to_user_id_fkey;
ALTER TABLE transfer_records
  ADD CONSTRAINT transfer_records_from_user_id_fkey
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT transfer_records_to_user_id_fkey
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 8. user_coupons.user_id → CASCADE
ALTER TABLE user_coupons
  DROP CONSTRAINT IF EXISTS user_coupons_user_id_fkey;
ALTER TABLE user_coupons
  ADD CONSTRAINT user_coupons_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 9. voucher_redeem_requests.user_id → CASCADE
ALTER TABLE voucher_redeem_requests
  DROP CONSTRAINT IF EXISTS voucher_redeem_requests_user_id_fkey;
ALTER TABLE voucher_redeem_requests
  ADD CONSTRAINT voucher_redeem_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 10. withdrawal_requests.user_id → CASCADE
ALTER TABLE withdrawal_requests
  DROP CONSTRAINT IF EXISTS withdrawal_requests_user_id_fkey;
ALTER TABLE withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 11. users.referrer_id（自引用）→ SET NULL（推荐人删了不影响被推荐人）
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_referrer_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_referrer_id_fkey
    FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE SET NULL;
