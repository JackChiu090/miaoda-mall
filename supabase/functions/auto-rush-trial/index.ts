// auto-rush-trial: 【已废弃】体验商家改为手动选择进货，本函数不再自动进货，直接跳过
//
// 说明：新流程下，体验商家在早场可自行选择进货最多 2 单（无需推荐好友），
// 不再由系统批量自动进货。保留此函数仅为兼容旧定时任务，调用即返回 skipped。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(JSON.stringify({ skipped: true, reason: 'trial_now_manual' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
