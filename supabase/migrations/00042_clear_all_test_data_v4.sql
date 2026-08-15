
-- ============================================================
-- 清除所有测试数据 v4
-- ============================================================

-- 先断开 products.origin_order_id 引用
UPDATE products SET origin_order_id = NULL WHERE origin_order_id IS NOT NULL;

-- 依赖 orders 的子表
DELETE FROM transfer_records;
DELETE FROM order_splits;
DELETE FROM team_splits;
DELETE FROM order_status_logs;
DELETE FROM account_transactions;
DELETE FROM withdrawal_review_logs;
DELETE FROM withdrawal_requests;
DELETE FROM exchange_orders;
DELETE FROM voucher_redeem_requests;

-- 删 orders
DELETE FROM orders;

-- 商品/活动相关
DELETE FROM activity_products;
DELETE FROM activities;
DELETE FROM rush_early_access;
DELETE FROM products;

-- 用户账户（清空，保留老板记录但余额清零）
DELETE FROM virtual_accounts WHERE user_id != 'a256890e-d87a-4b90-8158-301007001c23';
UPDATE virtual_accounts SET balance = 0, total_in = 0, total_out = 0, updated_at = now() WHERE user_id = 'a256890e-d87a-4b90-8158-301007001c23';

-- KYC / 认证 / 分销 / 通知
DELETE FROM kyc_applications;
DELETE FROM distribution_relations;
DELETE FROM notifications;
DELETE FROM screening_records;
DELETE FROM daily_screenings;

-- 用户附属表
DELETE FROM user_addresses;
DELETE FROM user_assessments;
DELETE FROM user_coupons;
DELETE FROM elimination_records;
DELETE FROM leader_qualification_reviews;
DELETE FROM admin_operation_logs;
DELETE FROM mobile_sessions;

-- 删除测试用户（保留老板 13924151349）
DELETE FROM users WHERE id != 'a256890e-d87a-4b90-8158-301007001c23';

-- 重置平台代金券资金池
UPDATE voucher_pool SET accumulated = 0, total_exchanged_count = 0, last_exchange_at = NULL, updated_at = now();
