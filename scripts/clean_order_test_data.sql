-- ============================================================================
-- 数据清理脚本：清除「订单列表」相关的所有测试数据
-- ----------------------------------------------------------------------------
-- 清理范围：
--   1. 订单主表及订单状态日志、拆单记录、转拍/赠送记录
--   2. 订单关联的奖励/分润记录（推荐奖励、佣金、早市激励奖励）
--   3. 支付与资金记录（提现申请及审核日志、收款账户绑定、账户流水）
--   4. 重置非老板用户的虚拟账户余额（清除订单产生的资金）
-- 保留范围（生产数据）：
--   - 老板账号(is_super_admin=true)及其虚拟账户、权限配置
--   - 系统配置、商品分类、抢购时段、激励配置、活动/公告/Banner 等运营配置
--   - 数据库表结构与核心业务逻辑代码
--
-- 说明：所有外键均为 ON DELETE CASCADE，按依赖顺序删除以确保安全。
--       脚本包裹在事务中，任一步骤失败将自动回滚，不影响生产数据。
-- 用法：在 Supabase SQL Editor 或 psql 中执行本脚本。
-- ============================================================================

BEGIN;

-- ① 订单关联子表（先于主表删除，避免外键约束冲突）
DELETE FROM public.order_status_logs;        -- 订单状态流转日志
DELETE FROM public.order_splits;             -- 拆单记录
DELETE FROM public.transfer_records;         -- 转拍/赠送记录

-- ② 订单关联的奖励与分润记录
DELETE FROM public.referral_rewards;         -- 推荐奖励（关联订单）
DELETE FROM public.commission_records;       -- 佣金/分润记录（关联订单）
DELETE FROM public.morning_reward_records;   -- 早市激励奖励（关联订单）

-- ③ 支付与资金记录
DELETE FROM public.withdrawal_review_logs;   -- 提现审核日志
DELETE FROM public.withdrawal_requests;      -- 提现申请
DELETE FROM public.payment_accounts;         -- 收款账户绑定
DELETE FROM public.account_transactions;     -- 账户资金流水

-- ④ 重置非老板用户的虚拟账户余额（清除订单产生的资金，保留老板账户）
UPDATE public.virtual_accounts
SET balance = 0,
    total_in = 0,
    total_out = 0
WHERE user_id IN (SELECT id FROM public.users WHERE is_super_admin = false);

-- ④.1 断开商品对订单的外键引用（products.origin_order_id 非级联，置空以保留商品记录）
UPDATE public.products SET origin_order_id = NULL WHERE origin_order_id IS NOT NULL;

-- ⑤ 订单主表（最后删除，CASCADE 会再次兜底清理任何遗漏的关联数据）
DELETE FROM public.orders;

-- ⑥ 重置自增/序列（如存在），确保新订单编号从干净起点开始
-- 注：orders 主键为 UUID，无需重置序列；如使用 bigint 自增可取消下面注释
-- SELECT setval(pg_get_serial_sequence('public.orders','id'), 1, false);

COMMIT;

-- 校验：执行后可运行以下查询确认订单相关数据已清空
-- SELECT
--   (SELECT count(*) FROM public.orders)               AS orders,
--   (SELECT count(*) FROM public.order_status_logs)    AS status_logs,
--   (SELECT count(*) FROM public.referral_rewards)     AS referral_rewards,
--   (SELECT count(*) FROM public.account_transactions) AS transactions,
--   (SELECT count(*) FROM public.users WHERE is_super_admin = true) AS boss_preserved;