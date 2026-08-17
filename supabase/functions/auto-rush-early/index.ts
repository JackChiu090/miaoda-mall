// auto-rush-early: 【已禁用】自动为正式商家进货功能已关闭，系统改为纯手动进货模式。
// 保留此函数仅为兼容旧前端调用，调用即返回 disabled。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 正式商家早市限购数量从 morning_incentive_config.regular_first_order_limit 读取（默认 2）

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  console.log('[auto-rush-early] 自动进货已禁用，返回 disabled');
  return new Response(JSON.stringify({ skipped: true, reason: 'auto_rush_disabled', created: 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});