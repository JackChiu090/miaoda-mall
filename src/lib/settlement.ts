/**
 * 交易结算工具
 * 卖方确认收款后：
 *  1. 结算卖方全额入账（balance 账户）
 *  2. 按系统分润费率分配奖励：
 *     - 商家分红（merchant_bonus_rate）→ 买方 bonus 账户
 *     - 老板分红（boss_bonus_rate）    → 固定老板用户 bonus 账户
 *     - 代金券储备（voucher_reserve_rate 0.3%）→ 买方 points 账户 + 全局 voucher_pool 累计
 *  3. 直接奖励（direct_referral_rate 订单金额 × 0.2%，发到 promotion 账户）：
 *     直接奖励给买方的直接推荐人（referrer_id），一级，不再向上递推
 */
import { supabase } from '@/db/supabase';

interface SettleParams {
  orderId: string;
  sellerId: string;
  buyerId: string;
  /** 订单成交金额 */
  orderAmount: number;
  /** 已废弃，保留兼容 */
  consignmentFee?: number;
  storageFee?: number;
}

export interface SettleResult {
  success: boolean;
  netAmount: number;
  serviceFee: number;
  error?: string;
}

/** 安全增加账户余额（直接操作底层 virtual_accounts 表，绕过视图写限制） */
async function addUserAccount(
  userId: string,
  accountType: string,
  amount: number,
  orderId: string,
  desc: string,
) {
  if (amount <= 0) return;
  // 查底层表（user_accounts 是视图，INSERT 不可用）
  const { data: acct } = await supabase
    .from('virtual_accounts')
    .select('id,balance,total_in')
    .eq('user_id', userId)
    .eq('account_type', accountType)
    .maybeSingle();

  let accountId: string;
  let balanceAfter: number;

  if (acct) {
    const newBalance = Number((Number(acct.balance) + amount).toFixed(2));
    const newTotalIn = Number((Number(acct.total_in ?? 0) + amount).toFixed(2));
    await supabase.from('virtual_accounts').update({
      balance: newBalance,
      total_in: newTotalIn,
      updated_at: new Date().toISOString(),
    }).eq('id', acct.id);
    accountId   = acct.id;
    balanceAfter = newBalance;
  } else {
    const { data: newAcct } = await supabase.from('virtual_accounts').insert({
      user_id:      userId,
      account_type: accountType,
      balance:      amount,
      total_in:     amount,
      total_out:    0,
      updated_at:   new Date().toISOString(),
    }).select('id').single();
    if (!newAcct) return;
    accountId   = newAcct.id;
    balanceAfter = amount;
  }

  await supabase.from('account_transactions').insert({
    account_id:       accountId,
    user_id:          userId,
    account_type:     accountType,
    type:             'in',
    amount,
    balance_after:    balanceAfter,
    related_order_id: orderId,
    description:      desc,
  });
}

/**
 * 结算卖家收益 + 分润分配
 */
export async function settleSellerEarnings(params: SettleParams): Promise<SettleResult> {
  const { orderId, sellerId, buyerId, orderAmount } = params;
  const netAmount = Number(orderAmount.toFixed(2));

  // ── 1. 卖方全额入账（余额账户）──
  await addUserAccount(
    sellerId, 'balance', netAmount, orderId,
    `交易结算入账`,
  );

  // ── 2. 更新订单结算字段 ──
  await supabase.from('orders').update({
    settled_at: new Date().toISOString(),
    service_fee: 0,
    net_amount: netAmount,
  }).eq('id', orderId);

  // ── 3. 读取分润费率配置 ──
  const RATE_KEYS = ['merchant_bonus_rate', 'boss_bonus_rate', 'voucher_reserve_rate'];
  const { data: rateRows } = await supabase.from('system_settings').select('key,value').in('key', RATE_KEYS);
  const rateMap: Record<string, number> = {};
  (rateRows ?? []).forEach(r => { rateMap[r.key] = parseFloat(r.value) || 0; });
  const merchantRate = rateMap['merchant_bonus_rate']  ?? 0.01;
  const bossRate     = rateMap['boss_bonus_rate']      ?? 0.015;
  const voucherRate  = rateMap['voucher_reserve_rate'] ?? 0.003;

  // ── 4. 老板分红固定账户 ──
  const BOSS_USER_ID = 'a256890e-d87a-4b90-8158-301007001c23'; // 13924151349

  // ── 5. 并行分发奖励（商家分红 / 老板分红 / 代金券储备）──
  // 注：直接奖励（direct_referral_rate 0.2%）在下方 Step 6 由 settleReferralReward 直接发给买方直接推荐人
  const merchantAmt = Number((orderAmount * merchantRate).toFixed(2));
  const bossAmt     = Number((orderAmount * bossRate).toFixed(2));
  const voucherAmt  = Number((orderAmount * voucherRate).toFixed(2));

  await Promise.all([
    // 商家分红 → 买方 bonus
    addUserAccount(buyerId, 'bonus', merchantAmt, orderId,
      `商家分红（${(merchantRate * 100).toFixed(1)}%）`),
    // 老板分红 → 固定老板账户 bonus
    addUserAccount(BOSS_USER_ID, 'bonus', bossAmt, orderId,
      `老板分红（${(bossRate * 100).toFixed(1)}%）`),
    // 代金券储备 0.3% → 买方 points 账户（累计到门槛可兑换）+ 全局资金池
    (async () => {
      await addUserAccount(buyerId, 'points', voucherAmt, orderId,
        `代金券储备（${(voucherRate * 100).toFixed(1)}%）`);
      // 同步更新全局平台代金券资金池
      const { data: pool } = await supabase.from('voucher_pool').select('id,accumulated').order('id').limit(1).maybeSingle();
      if (pool) {
        await supabase.from('voucher_pool').update({
          accumulated: Number((Number(pool.accumulated) + voucherAmt).toFixed(4)),
          updated_at: new Date().toISOString(),
        }).eq('id', pool.id);
      }
    })(),
  ]);

  // ── 6. 直接奖励：按 direct_referral_rate（默认 0.2%）发放给买方的直接推荐人 ──
  await settleReferralReward({ orderId, buyerId, orderAmount });

  return { success: true, netAmount, serviceFee: 0 };
}

/**
 * 发放直接奖励（订单金额 × direct_referral_rate，默认 0.2%，发到 promotion 账户）。
 *
 * 规则：
 *  - 奖励对象 = 买方的直接推荐人（users.referrer_id），仅一级，不向上递推
 *  - 买方无直接推荐人（referrer_id 为空）→ 不发放
 *  - 幂等：referral_rewards 表 order_id 唯一检查，防止重复发放
 */
async function settleReferralReward({
  orderId,
  buyerId,
  orderAmount,
}: {
  orderId: string;
  buyerId: string;
  orderAmount: number;
}) {
  // 幂等检查：已存在则直接跳过
  const { count: already } = await supabase
    .from('referral_rewards')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);
  if ((already ?? 0) > 0) return;

  // 读取奖励比例配置（默认 0.2%）
  const { data: cfg } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'direct_referral_rate')
    .maybeSingle();
  const rate = parseFloat(cfg?.value ?? '0.002');
  const rewardAmt = Number((orderAmount * rate).toFixed(2));
  if (rewardAmt <= 0) return;

  // 直接奖励：发放给买方的直接推荐人（一级）
  const { data: buyerRow } = await supabase
    .from('users')
    .select('referrer_id')
    .eq('id', buyerId)
    .maybeSingle();
  const referrerId: string | null = buyerRow?.referrer_id ?? null;

  if (!referrerId) {
    console.log(`[settlement] direct_reward: buyer=${buyerId} 无直接推荐人，不发放`);
    return;
  }

  await addUserAccount(
    referrerId, 'promotion', rewardAmt, orderId,
    `直接奖励（${(rate * 100).toFixed(1)}%）`,
  );
  await supabase.from('referral_rewards').insert({
    order_id:        orderId,
    buyer_id:        buyerId,
    recipient_id:    referrerId,
    skipped_ids:     [],
    amount:          rewardAmt,
    recipient_level: 1,
    reward_rate:     rate,
    status:          'settled',
  });
  console.log(`[settlement] direct_reward: buyer=${buyerId} → referrer=${referrerId}, amount=${rewardAmt}`);
}
