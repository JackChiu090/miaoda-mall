// process-morning-reward: 订单确认收款(confirmed)后，按推荐链路逐级向上分配早市激励奖励
//
// 业务规则：
//   - 订单状态变为 confirmed 时触发
//   - 从买家(buyer_id)出发，沿 referrer_id 链路逐级向上
//   - 规定完成时间(deadline_hour:deadline_minute，周一至周五)：上级需在该时间前完成订单交易
//   - 奖励 = 订单金额 × reward_rate，分配给链路中首个在规定时间内完成交易的上级
//   - 若上级在规定时间内未完成交易，则继续向上检查上上级
//   - 幂等：同一订单只发放一次奖励（按 order_id 去重）
//   - 奖励计入获奖上级的推广奖金账户

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 计算北京(UTC+8)某日期的"规定完成时间"对应的 UTC 时间戳
function deadlineTsForDate(bjDate: Date, hour: number, minute: number): number {
  const y = bjDate.getFullYear();
  const m = bjDate.getMonth();
  const d = bjDate.getDate();
  // 北京时间 hour:minute → UTC 时间戳
  return Date.UTC(y, m, d, hour, minute, 0) - 8 * 3600000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const orderId: string | undefined = body.order_id;

    if (!orderId) {
      return new Response(JSON.stringify({ error: '缺少 order_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 幂等：该订单已发放过奖励则跳过
    const { data: existing } = await db
      .from('morning_reward_records')
      .select('id')
      .eq('order_id', orderId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_rewarded' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 读取订单信息
    const { data: order } = await db
      .from('orders')
      .select('id, amount, buyer_id, confirmed_at, created_at')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) {
      return new Response(JSON.stringify({ error: '订单不存在' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (order.confirmed_at == null) {
      return new Response(JSON.stringify({ skipped: true, reason: 'not_confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 读取激励配置
    const { data: cfg } = await db
      .from('morning_incentive_config')
      .select('first_order_limit, deadline_hour, deadline_minute, reward_rate')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const deadlineHour = cfg?.deadline_hour ?? 12;
    const deadlineMinute = cfg?.deadline_minute ?? 0;
    const rewardRate = Number(cfg?.reward_rate ?? 0.002);

    const rewardAmount = Number(order.amount) * rewardRate;
    if (rewardAmount <= 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'zero_amount' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 计算订单所属"北京日"的规定完成时间
    // 订单确认时间(UTC) → 北京时间
    const confirmedUtc = new Date(order.confirmed_at);
    const bjOffset = 8 * 3600000;
    const bjConfirmed = new Date(confirmedUtc.getTime() + bjOffset);
    const deadlineTs = deadlineTsForDate(bjConfirmed, deadlineHour, deadlineMinute);

    // 逐级向上遍历推荐链路
    let currentId: string | null = order.buyer_id;
    let level = 0;
    let recipientId: string | null = null;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      level += 1;
      const { data: user } = await db
        .from('users')
        .select('id, referrer_id')
        .eq('id', currentId)
        .maybeSingle();
      if (!user || !user.referrer_id) break;

      const parentId: string = user.referrer_id;
      // 检查上级在规定时间内是否完成订单交易
      const { count: parentCompleted } = await db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', parentId)
        .eq('status', 'confirmed')
        .lte('confirmed_at', new Date(deadlineTs).toISOString());
      // 父级作为买家，在规定时间内有已确认的订单 → 命中
      if ((parentCompleted ?? 0) > 0) {
        recipientId = parentId;
        break;
      }
      currentId = parentId;
    }

    if (!recipientId) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_eligible_upline' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 发放奖励：写入记录 + 累加获奖者推广奖金账户余额
    const { error: insErr } = await db.from('morning_reward_records').insert({
      order_id: orderId,
      buyer_id: order.buyer_id,
      reward_amount: rewardAmount,
      recipient_id: recipientId,
      recipient_level: level,
      reward_rate: rewardRate,
    });
    if (insErr) throw insErr;

    // 更新推广奖金账户余额（virtual_accounts 底层表）
    const { data: acct } = await db
      .from('virtual_accounts')
      .select('id, balance, total_in')
      .eq('user_id', recipientId)
      .eq('account_type', 'promotion')
      .maybeSingle();
    const newBalance = Number((Number(acct?.balance ?? 0) + rewardAmount).toFixed(2));
    const newTotalIn = Number((Number(acct?.total_in ?? 0) + rewardAmount).toFixed(2));
    if (acct) {
      const { error: updErr } = await db.from('virtual_accounts').update({
        balance: newBalance,
        total_in: newTotalIn,
        updated_at: new Date().toISOString(),
      }).eq('id', acct.id);
      if (updErr) throw updErr;
      await db.from('account_transactions').insert({
        account_id: acct.id,
        user_id: recipientId,
        account_type: 'promotion',
        type: 'in',
        amount: rewardAmount,
        balance_after: newBalance,
        related_order_id: orderId,
        description: `早市激励奖励（下级订单 ${order.id.slice(0, 8)}）`,
      });
    } else {
      const { data: newAcct, error: newErr } = await db.from('virtual_accounts').insert({
        user_id: recipientId,
        account_type: 'promotion',
        balance: rewardAmount,
        total_in: rewardAmount,
        total_out: 0,
        updated_at: new Date().toISOString(),
      }).select('id').single();
      if (newErr) throw newErr;
      await db.from('account_transactions').insert({
        account_id: newAcct.id,
        user_id: recipientId,
        account_type: 'promotion',
        type: 'in',
        amount: rewardAmount,
        balance_after: rewardAmount,
        related_order_id: orderId,
        description: `早市激励奖励（下级订单 ${order.id.slice(0, 8)}）`,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      recipient_id: recipientId,
      recipient_level: level,
      reward_amount: rewardAmount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});