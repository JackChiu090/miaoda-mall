// daily-screening: 每日吃土筛选完整逻辑
// 1. 恢复昨日已下单用户（返还50%扣款）
// 2. 3天宽限期到期 → 永久扣款
// 3. 20天无直推下单 → 冻结账户
// 4. 活跃用户>=门槛 → 随机抽取5%，扣50%余额→老板账户
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const triggeredBy: string = body.triggered_by ?? 'cron';
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // ── 读取 system_settings 参数 ──
    const { data: cfgs } = await db
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'eat_soil_rate',
        'eat_soil_min_active_users',
        'eat_soil_deduct_rate',
        'eat_soil_recover_days',
        'eat_soil_freeze_referral_days',
      ]);
    const cfg: Record<string, number> = {};
    (cfgs ?? []).forEach((c: { key: string; value: string }) => {
      cfg[c.key] = parseFloat(c.value) || 0;
    });
    const eatSoilRate       = cfg['eat_soil_rate']                ?? 0.05;
    const minActiveUsers    = cfg['eat_soil_min_active_users']    ?? 20;
    const deductRate        = cfg['eat_soil_deduct_rate']         ?? 0.5;
    const recoverDays       = cfg['eat_soil_recover_days']        ?? 3;
    const freezeReferralDays= cfg['eat_soil_freeze_referral_days']?? 20;

    // ── 找老板账户（手机号 18800009999） ──
    const { data: bossUser } = await db
      .from('users')
      .select('id')
      .eq('phone', '18800009999')
      .maybeSingle();
    const bossId: string | null = bossUser?.id ?? null;

    const log: string[] = [];

    // ════════════════════════════════════════════════
    // PHASE 1：恢复 — 昨日被筛用户若今日已下单则返还扣款
    // ════════════════════════════════════════════════
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    // 找昨日未恢复的吃土记录
    const { data: pendingRecords } = await db
      .from('screening_records')
      .select('id, user_id, deducted_amount')
      .eq('screened_date', yesterday)
      .eq('deduction_restored', false)
      .eq('expired', false);

    let restoredCount = 0;
    for (const rec of (pendingRecords ?? [])) {
      // 检查该用户今日是否下单
      const { count: orderCount } = await db
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', rec.user_id)
        .gte('created_at', `${today}T00:00:00Z`);
      if ((orderCount ?? 0) > 0 && rec.deducted_amount > 0) {
        // 返还扣款：从老板账户扣回，返回用户 bonus 账户
        if (bossId && rec.deducted_amount > 0) {
          await db.rpc('transfer_balance', {
            from_user_id: bossId,
            to_user_id:   rec.user_id,
            amount:       rec.deducted_amount,
            account_type: 'bonus',
            description:  '吃土恢复：用户次日下单，返还扣款',
          }).catch(() => null); // rpc 不存在则跳过，下面用手动方式
          // 手动方式兜底
          const { data: bossAcc } = await db
            .from('user_accounts')
            .select('id, balance')
            .eq('user_id', bossId)
            .eq('account_type', 'bonus')
            .maybeSingle();
          const { data: userAcc } = await db
            .from('user_accounts')
            .select('id, balance')
            .eq('user_id', rec.user_id)
            .eq('account_type', 'bonus')
            .maybeSingle();
          if (bossAcc && userAcc && bossAcc.balance >= rec.deducted_amount) {
            await db.from('user_accounts')
              .update({ balance: bossAcc.balance - rec.deducted_amount, updated_at: now.toISOString() })
              .eq('id', bossAcc.id);
            await db.from('user_accounts')
              .update({ balance: userAcc.balance + rec.deducted_amount, updated_at: now.toISOString() })
              .eq('id', userAcc.id);
            await db.from('account_transactions').insert([
              {
                user_id: bossId, account_type: 'bonus', type: 'debit',
                amount: -rec.deducted_amount,
                balance_after: bossAcc.balance - rec.deducted_amount,
                description: `吃土恢复返还给用户 ${rec.user_id}`,
              },
              {
                user_id: rec.user_id, account_type: 'bonus', type: 'credit',
                amount: rec.deducted_amount,
                balance_after: userAcc.balance + rec.deducted_amount,
                description: '吃土恢复：次日下单返还',
              },
            ]);
          }
        }
        await db.from('screening_records')
          .update({ deduction_restored: true, restored_at: now.toISOString() })
          .eq('id', rec.id);
        await db.from('users').update({ screening_today: false, eat_soil_deducted: false }).eq('id', rec.user_id);
        restoredCount++;
      }
    }
    log.push(`phase1_restored=${restoredCount}`);

    // ════════════════════════════════════════════════
    // PHASE 2：过期 — 宽限期（recoverDays天）已到且未恢复 → 永久扣款
    // ════════════════════════════════════════════════
    const expireBefore = new Date(now.getTime() - recoverDays * 86400000).toISOString();
    const { data: expiredRecs } = await db
      .from('screening_records')
      .select('id, user_id')
      .eq('deduction_restored', false)
      .eq('expired', false)
      .lt('expires_at', expireBefore);

    let expiredCount = 0;
    for (const rec of (expiredRecs ?? [])) {
      await db.from('screening_records').update({ expired: true }).eq('id', rec.id);
      await db.from('users').update({ screening_today: false, eat_soil_deducted: false }).eq('id', rec.user_id);
      expiredCount++;
    }
    log.push(`phase2_expired=${expiredCount}`);

    // ════════════════════════════════════════════════
    // PHASE 3：冻结 — 连续 N 天未推荐新人下单 → 冻结
    // ════════════════════════════════════════════════
    const freezeCutoff = new Date(now.getTime() - freezeReferralDays * 86400000).toISOString();
    // 找 last_referral_order_at < cutoff 且未冻结的用户
    const { data: staleUsers } = await db
      .from('users')
      .select('id')
      .eq('is_banned', false)
      .eq('user_status', 'active')
      .not('last_referral_order_at', 'is', null)
      .lt('last_referral_order_at', freezeCutoff);

    let frozenCount = 0;
    for (const u of (staleUsers ?? [])) {
      await db.from('users').update({
        is_banned: true,
        ban_reason: `连续${freezeReferralDays}天未推荐新人下单，系统自动冻结`,
        user_status: 'banned',
      }).eq('id', u.id);
      frozenCount++;
    }
    log.push(`phase3_frozen=${frozenCount}`);

    // ════════════════════════════════════════════════
    // PHASE 4：今日筛选
    // ════════════════════════════════════════════════
    // 检查今日是否已执行
    const { data: existing } = await db
      .from('daily_screenings')
      .select('id')
      .eq('screening_date', today)
      .eq('status', 'completed')
      .maybeSingle();
    if (existing && triggeredBy !== 'manual') {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_done_today', log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 重置昨日 screening_today 标志（保底清除）
    await db.from('users').update({ screening_today: false }).eq('screening_today', true);

    // 活跃用户：近90天有下单记录
    const activeCutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
    const { data: activeOrderUsers } = await db
      .from('orders')
      .select('buyer_id')
      .gte('created_at', activeCutoff)
      .in('status', ['payment_uploaded', 'confirmed', 'completed']);

    const uniqueActiveIds = [...new Set((activeOrderUsers ?? []).map((o: { buyer_id: string }) => o.buyer_id))];
    const total = uniqueActiveIds.length;

    if (total < minActiveUsers) {
      log.push(`phase4_skipped=active_below_threshold(${total}<${minActiveUsers})`);
      return new Response(JSON.stringify({ skipped: true, reason: `active_below_threshold`, active: total, threshold: minActiveUsers, log }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ratio = eatSoilRate;
    const count = Math.max(1, Math.round(total * ratio));
    const shuffled = [...uniqueActiveIds].sort(() => Math.random() - 0.5).slice(0, count);

    // 创建批次
    const expiresAt = new Date(now.getTime() + recoverDays * 86400000).toISOString();
    const { data: batchRow, error: bErr } = await db
      .from('daily_screenings')
      .insert({
        screening_date: today,
        total_active:   total,
        screened_count: shuffled.length,
        ratio_used:     ratio.toFixed(4),
        status:         'completed',
        triggered_by:   triggeredBy,
        note:           `门槛:${minActiveUsers} 扣款率:${deductRate*100}% 宽限:${recoverDays}天`,
      })
      .select('id')
      .single();
    if (bErr || !batchRow) throw new Error(`batch insert failed: ${bErr?.message}`);

    // 对每个被筛用户：扣50%总余额 → 老板账户
    let totalDeducted = 0;
    for (const uid of shuffled) {
      // 读取用户 bonus 账户余额（总收益账户）
      const { data: bonusAcc } = await db
        .from('user_accounts')
        .select('id, balance')
        .eq('user_id', uid)
        .eq('account_type', 'bonus')
        .maybeSingle();
      const bonusBalance = Number(bonusAcc?.balance ?? 0);
      const deductAmount = Math.floor(bonusBalance * deductRate * 100) / 100;

      if (deductAmount > 0 && bonusAcc && bossId) {
        // 扣用户 bonus
        await db.from('user_accounts')
          .update({ balance: bonusBalance - deductAmount, updated_at: now.toISOString() })
          .eq('id', bonusAcc.id);
        // 加老板 bonus
        const { data: bossAcc } = await db
          .from('user_accounts')
          .select('id, balance')
          .eq('user_id', bossId)
          .eq('account_type', 'bonus')
          .maybeSingle();
        if (bossAcc) {
          await db.from('user_accounts')
            .update({ balance: Number(bossAcc.balance) + deductAmount, updated_at: now.toISOString() })
            .eq('id', bossAcc.id);
        }
        // 记流水
        await db.from('account_transactions').insert([
          {
            user_id: uid, account_type: 'bonus', type: 'debit',
            amount: -deductAmount,
            balance_after: bonusBalance - deductAmount,
            description: `吃土机制：扣除50%收益，宽限${recoverDays}天内下单可恢复`,
          },
          ...(bossAcc ? [{
            user_id: bossId, account_type: 'bonus', type: 'credit',
            amount: deductAmount,
            balance_after: Number(bossAcc.balance) + deductAmount,
            description: `吃土收益来自用户 ${uid}`,
          }] : []),
        ]);
        totalDeducted += deductAmount;
      }

      // 插入明细记录
      await db.from('screening_records').insert({
        screening_id:  batchRow.id,
        user_id:       uid,
        screened_date: today,
        deducted_amount: deductAmount,
        expires_at:    expiresAt,
      });

      // 标记用户今日被吃土
      await db.from('users')
        .update({ screening_today: true, eat_soil_deducted: true })
        .eq('id', uid);

      // ── 连续两次吃土 → 自动加入 9:29 体验商家抢单资格 ──
      // 查询该用户历史 screening_records 记录数（含今日刚插入的）
      const { count: screenCount } = await db
        .from('screening_records')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid);
      if ((screenCount ?? 0) >= 2) {
        // 检查是否已在名单中，避免重复插入
        const { count: alreadyIn } = await db
          .from('rush_early_access')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid);
        if ((alreadyIn ?? 0) === 0) {
          await db.from('rush_early_access').insert({
            user_id:       uid,
            added_by_admin: 'system',
            notes:         '连续两次触发吃土机制，系统自动授予9:29体验商家抢单资格',
          });
          console.log(`[daily-screening] 用户 ${uid} 连续${screenCount}次吃土，已自动加入09:29抢单资格`);
        }
      }
    }

    log.push(`phase4_screened=${shuffled.length} total_deducted=${totalDeducted.toFixed(2)}`);
    console.log(`[daily-screening] ${log.join(' | ')}`);

    return new Response(JSON.stringify({
      screened: shuffled.length, total, ratio, totalDeducted, log,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[daily-screening]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
