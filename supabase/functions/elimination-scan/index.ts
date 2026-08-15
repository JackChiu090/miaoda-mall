// elimination-scan: 每周扫描淘汰用户
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface User {
  id: string;
  phone: string;
  last_login_at: string | null;
  user_status: string;
  assessment_status: string;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const triggeredBy = body.triggered_by ?? 'cron';

    // 读取参数
    const { data: cfgs } = await db
      .from('system_configs')
      .select('config_key, config_value')
      .in('config_key', ['elimination_inactive_days', 'elimination_enabled']);
    const cfgMap: Record<string, string> = {};
    (cfgs ?? []).forEach((c: { config_key: string; config_value: string }) => {
      cfgMap[c.config_key] = c.config_value;
    });

    if (cfgMap.elimination_enabled === 'false') {
      return new Response(JSON.stringify({ skipped: true, reason: 'elimination_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const inactiveDays = Number(cfgMap.elimination_inactive_days ?? 30);
    const cutoff = new Date(Date.now() - inactiveDays * 86400000).toISOString();
    const now = new Date().toISOString();

    // 查询活跃/体验期用户（排除已淘汰）
    const { data: users } = await db
      .from('users')
      .select('id, phone, last_login_at, user_status, assessment_status, created_at')
      .in('user_status', ['active', 'trial'])
      .order('created_at');

    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ eliminated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let eliminatedCount = 0;
    const toEliminate: { id: string; reason: string; detail: string }[] = [];

    for (const u of users as User[]) {
      const lastLogin = u.last_login_at ?? u.created_at;
      const isInactive = new Date(lastLogin) < new Date(cutoff);

      if (isInactive) {
        toEliminate.push({
          id:     u.id,
          reason: 'inactive',
          detail: `近${inactiveDays}天未登录，最后登录：${lastLogin}`,
        });
      }
    }

    // 批量淘汰
    for (const item of toEliminate) {
      // 检查是否已有未恢复的淘汰记录（避免重复淘汰）
      const { data: existing } = await db
        .from('elimination_records')
        .select('id')
        .eq('user_id', item.id)
        .is('restored_at', null)
        .maybeSingle();

      if (existing) continue;

      await db.from('users').update({
        user_status:    'eliminated',
        eliminated_at:  now,
      }).eq('id', item.id);

      await db.from('elimination_records').insert({
        user_id:       item.id,
        reason:        item.reason,
        reason_detail: item.detail,
        eliminated_by: triggeredBy === 'manual' ? '管理员' : 'system',
        eliminated_at: now,
      });

      eliminatedCount++;
    }

    console.log(`[elimination-scan] scanned=${users.length} eliminated=${eliminatedCount}`);
    return new Response(JSON.stringify({
      scanned:    users.length,
      eliminated: eliminatedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[elimination-scan]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
