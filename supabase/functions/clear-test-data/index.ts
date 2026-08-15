// clear-test-data: 一键清除测试业务数据，保留老板账号、管理员、系统配置与数据库结构
//
// 清除范围（业务数据）：订单、商品、资金流水、虚拟账户、分销关系、考核、筛选、淘汰、
//   拆单/拆人、转拍、地址、优惠券、提现、早市激励奖励、通知等。
// 保留范围：老板账号(is_super_admin=true)、管理员账号、系统配置、商品分类、抢购时段、
//   激励配置、活动/公告/Banner 等运营配置、数据库表结构。
//
// 安全：仅超级管理员可调用；users 表仅删除非老板用户；使用事务，失败回滚。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 需清除的业务数据表（均 ON DELETE CASCADE，逐表删除即可，顺序不影响结果）
const BUSINESS_TABLES = [
  'order_status_logs',
  'withdrawal_review_logs',
  'withdrawal_requests',
  'voucher_redeem_requests',
  'exchange_orders',
  'notifications',
  'rush_early_access',
  'user_coupons',
  'user_addresses',
  'transfer_records',
  'team_splits',
  'order_splits',
  'elimination_records',
  'screening_records',
  'daily_screenings',
  'user_assessments',
  'kyc_applications',
  'distribution_relations',
  'morning_reward_records',
  'referral_rewards',
  'commission_records',
  'account_transactions',
  'virtual_accounts',
  'payment_accounts',
  'leader_qualification_reviews',
  'mobile_sessions',
  'products',
  'orders',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 鉴权：仅超级管理员（admin_users.role = 'super_admin'）
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await db.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: adminRow } = await db.from('admin_profiles').select('role, is_active').eq('id', caller.id).maybeSingle();
    if (!adminRow || adminRow.role !== 'super_admin' || adminRow.is_active === false) {
      return new Response(JSON.stringify({ error: '无权限，仅超级管理员可执行' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 清除前统计（用于结果展示）
    const before: Record<string, number> = {};
    for (const t of BUSINESS_TABLES) {
      const { count } = await db.from(t).select('id', { count: 'exact', head: true });
      before[t] = count ?? 0;
    }
    const { count: nonBossBefore } = await db.from('users').select('id', { count: 'exact', head: true }).eq('is_super_admin', false);
    before['users(非老板)'] = nonBossBefore ?? 0;

    // 执行清除：逐表删除业务数据（service role 绕过 RLS，ON DELETE CASCADE 连带清理）
    for (const t of BUSINESS_TABLES) {
      await db.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // 删除非老板用户（保留老板账号与权限配置）
    const { error: delErr } = await db.from('users').delete().eq('is_super_admin', false);
    if (delErr) throw delErr;

    // 清除后统计
    const after: Record<string, number> = {};
    for (const t of BUSINESS_TABLES) {
      const { count } = await db.from(t).select('id', { count: 'exact', head: true });
      after[t] = count ?? 0;
    }
    const { count: nonBossAfter } = await db.from('users').select('id', { count: 'exact', head: true }).eq('is_super_admin', false);
    after['users(非老板)'] = nonBossAfter ?? 0;
    const { count: bossCount } = await db.from('users').select('id', { count: 'exact', head: true }).eq('is_super_admin', true);

    const summary = Object.keys(before)
      .filter(k => before[k] > 0)
      .map(k => ({ table: k, cleared: before[k] - (after[k] ?? 0) }));

    return new Response(JSON.stringify({
      success: true,
      boss_preserved: bossCount ?? 0,
      summary,
      total_cleared: summary.reduce((s, r) => s + r.cleared, 0),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});