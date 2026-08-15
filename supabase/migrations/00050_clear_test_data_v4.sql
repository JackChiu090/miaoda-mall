
-- ============================================================
-- 清除所有测试数据（临时去掉 NOT NULL 约束断循环 FK）
-- 保留：super_admin(a256890e) + 所有配置/设置/内容类表
-- ============================================================

-- Step 1: 临时去掉循环列的 NOT NULL，以便断环
ALTER TABLE orders   ALTER COLUMN product_id      DROP NOT NULL;
ALTER TABLE products ALTER COLUMN origin_order_id DROP NOT NULL;
ALTER TABLE products ALTER COLUMN parent_product_id DROP NOT NULL;

-- Step 2: 断循环 FK
UPDATE orders   SET product_id       = NULL;
UPDATE products SET origin_order_id  = NULL;
UPDATE products SET parent_product_id = NULL;

-- Step 3: 清交易流水
DELETE FROM account_transactions;

-- Step 4: 推荐奖励
DELETE FROM referral_rewards;

-- Step 5: 转账记录
DELETE FROM transfer_records;

-- Step 6: 订单状态日志
DELETE FROM order_status_logs;

-- Step 7: 订单拆分
DELETE FROM order_splits;

-- Step 8: 活动商品关联
DELETE FROM activity_products;

-- Step 9: 商品（此时 origin_order_id / parent_product_id 已为 NULL）
DELETE FROM products;

-- Step 10: 订单（此时 product_id 已为 NULL）
DELETE FROM orders;

-- Step 11: 测试活动
DELETE FROM activities WHERE is_test = true;

-- Step 12: 虚拟账户
DELETE FROM virtual_accounts
WHERE user_id IS DISTINCT FROM 'a256890e-d87a-4b90-8158-301007001c23';
UPDATE virtual_accounts
SET balance = 0
WHERE user_id = 'a256890e-d87a-4b90-8158-301007001c23';

-- Step 13: 分销关系
DELETE FROM distribution_relations;

-- Step 14: 代金券池
DELETE FROM voucher_pool;

-- Step 15: 用户优惠券
DELETE FROM user_coupons;

-- Step 16: 用户地址
DELETE FROM user_addresses;

-- Step 17: KYC 申请
DELETE FROM kyc_applications;

-- Step 18: 用户评估
DELETE FROM user_assessments;

-- Step 19: 筛查记录
DELETE FROM screening_records;

-- Step 20: 每日筛查
DELETE FROM daily_screenings;

-- Step 21: 淘汰记录
DELETE FROM elimination_records;

-- Step 22: 抢购早鸟
DELETE FROM rush_early_access;

-- Step 23: 通知
DELETE FROM notifications;

-- Step 24: 兑换订单
DELETE FROM exchange_orders;

-- Step 25: 删除测试普通用户
DELETE FROM users
WHERE is_super_admin IS DISTINCT FROM true;

-- Step 26: super_admin 运行态字段重置
UPDATE users SET
  consecutive_missed     = 0,
  screening_today        = false,
  rush_skipped_today     = false,
  exit_request_at        = NULL,
  exit_request_note      = NULL,
  eat_soil_deducted      = false,
  last_referral_order_at = NULL
WHERE id = 'a256890e-d87a-4b90-8158-301007001c23';

-- Step 27: 恢复 NOT NULL（orders.product_id 业务上必须有值，恢复约束）
ALTER TABLE orders ALTER COLUMN product_id DROP NOT NULL;
-- 注：origin_order_id / parent_product_id 本就可为 NULL，无需恢复
