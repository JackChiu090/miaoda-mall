// assessment-check: 检查体验期到期用户，自动判定考核结果
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

    // 读取考核参数
    const { data: cfgs } = await db
      .from('system_configs')
      .select('config_key, config_value')
      .in('config_key', ['assessment_min_orders', 'assessment_min_invites']);
    const cfgMap: Record<string, string> = {};
    (cfgs ?? []).forEach((c: { config_key: string; config_value: string }) => {
      cfgMap[c.config_key] = c.config_value;
    });
    const minOrders  = Number(cfgMap.assessment_min_orders  ?? 1);
    const minInvites = Number(cfgMap.assessment_min_invites ?? 0);

    // 查找体验期已到期且状态仍为 in_progress 的考核记录
    const now = new Date().toISOString();
    const { data: expired } = await db
      .from('user_assessments')
      .select('id, user_id, orders_completed, invites_completed')
      .eq('status', 'in_progress')
      .lt('trial_end_at', now);

    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let passed = 0, failed = 0;
    for (const a of expired) {
      const pass = a.orders_completed >= minOrders && a.invites_completed >= minInvites;
      const newStatus = pass ? 'passed' : 'failed';

      await db.from('user_assessments')
        .update({ status: newStatus, auto_checked_at: now, updated_at: now })
        .eq('id', a.id);

      await db.from('users').update({
        user_status:       pass ? 'active' : 'eliminated',
        assessment_status: newStatus,
        promoted_at:       pass ? now : null,
        eliminated_at:     pass ? null : now,
      }).eq('id', a.user_id);

      if (!pass) {
        await db.from('elimination_records').insert({
          user_id:        a.user_id,
          reason:         'assessment',
          reason_detail:  `考核期结束：完成交易${a.orders_completed}/${minOrders}，招商${a.invites_completed}/${minInvites}`,
          eliminated_by:  'system',
          eliminated_at:  now,
        });
        failed++;
      } else {
        passed++;
      }
    }

    console.log(`[assessment-check] passed=${passed} failed=${failed}`);
    return new Response(JSON.stringify({ checked: expired.length, passed, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[assessment-check]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
