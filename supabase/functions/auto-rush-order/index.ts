// auto-rush-order: 【已禁用】自动批量抢单功能已关闭，系统改为纯手动抢单模式。
// 保留此函数仅为兼容旧 cron 配置，调用即返回 disabled。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  console.log('[auto-rush-order] 自动抢单已禁用，返回 disabled');
  return new Response(JSON.stringify({ skipped: true, reason: 'auto_rush_disabled' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
