-- 补加 DB 级幂等保护：同一订单只能产生一条推荐奖励记录
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_order_id_unique UNIQUE (order_id);