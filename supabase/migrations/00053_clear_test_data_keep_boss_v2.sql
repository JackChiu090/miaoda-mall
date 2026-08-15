-- 清除测试数据，仅保留老板账号（13924151349）与系统配置表
-- 按外键依赖顺序删除，最后删除非老板用户

-- 1. 推荐奖励记录
DELETE FROM referral_rewards;

-- 2. 佣金记录（依赖 orders）
DELETE FROM commission_records;

-- 3. 账户流水
DELETE FROM account_transactions;

-- 4. 活动商品
DELETE FROM activity_products;

-- 5. 活动
DELETE FROM activities;

-- 6. 订单
DELETE FROM orders;

-- 7. 商品
DELETE FROM products;

-- 8. 虚拟账户（保留老板的）
DELETE FROM virtual_accounts
WHERE user_id != 'a256890e-d87a-4b90-8158-301007001c23';

-- 9. 非老板用户（含测试体验/正式商家）
DELETE FROM users
WHERE id != 'a256890e-d87a-4b90-8158-301007001c23';

-- 10. 重置老板账户余额为 0（保持干净初始状态）
UPDATE virtual_accounts
SET balance = 0, total_in = 0, total_out = 0, updated_at = now()
WHERE user_id = 'a256890e-d87a-4b90-8158-301007001c23';