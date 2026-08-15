// order-split-check: 检测单笔订单金额达阈值时自动拆分为两个等额子订单
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Order {
  id: string;
  order_no: string;
  amount: number;
  cost_price: number;
  status: string;
  buyer_id: string | null;
  seller_id: string | null;
  product_id: string | null;
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
    const specificOrderId = body.order_id as string | undefined;
    const triggeredBy     = body.triggered_by ?? 'cron';

    // 读取拆单配置
    const { data: cfgs } = await db
      .from('system_configs')
      .select('config_key, config_value')
      .in('config_key', ['order_split_threshold', 'order_split_enabled']);
    const cfgMap: Record<string, string> = {};
    (cfgs ?? []).forEach((c: { config_key: string; config_value: string }) => {
      cfgMap[c.config_key] = c.config_value;
    });

    if (cfgMap.order_split_enabled === 'false') {
      return new Response(JSON.stringify({ skipped: true, reason: 'split_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 阈值：订单金额 >= threshold 时自动拆分为两笔各 threshold/2 的子订单
    const threshold  = Number(cfgMap.order_split_threshold ?? 20000);
    const subAmount  = Number((threshold / 2).toFixed(2)); // 每笔子订单金额，如 10000
    const now        = new Date().toISOString();

    // 查找订单金额 >= 阈值且尚未被拆过的订单
    let ordersQuery = db
      .from('orders')
      .select('id, order_no, amount, cost_price, status, buyer_id, seller_id, product_id')
      .in('status', ['completed', 'pending', 'paid'])
      .gte('amount', threshold);

    if (specificOrderId) {
      ordersQuery = ordersQuery.eq('id', specificOrderId);
    }

    const { data: candidates } = await ordersQuery;

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ split: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 查已拆过的订单 ID
    const { data: existingSplits } = await db
      .from('order_splits')
      .select('original_order_id');
    const alreadySplit = new Set((existingSplits ?? []).map((s: { original_order_id: string }) => s.original_order_id));

    let splitCount = 0;
    for (const order of candidates as Order[]) {
      if (alreadySplit.has(order.id)) continue;

      // 拆单逻辑：将订单拆为两笔各 subAmount（即 threshold/2）的子订单
      const costHalf = Number((Number(order.cost_price ?? 0) / 2).toFixed(2));

      // 生成子订单A
      const { data: orderA } = await db.from('orders').insert({
        order_no:        `${order.order_no}-A`,
        amount:          subAmount,
        cost_price:      costHalf,
        status:          order.status,
        buyer_id:        order.buyer_id,
        seller_id:       order.seller_id,
        product_id:      order.product_id,
        parent_order_id: order.id,
      }).select('id').single();

      // 生成子订单B
      const { data: orderB } = await db.from('orders').insert({
        order_no:        `${order.order_no}-B`,
        amount:          subAmount,
        cost_price:      Number(order.cost_price ?? 0) - costHalf,
        status:          order.status,
        buyer_id:        order.buyer_id,
        seller_id:       order.seller_id,
        product_id:      order.product_id,
        parent_order_id: order.id,
      }).select('id').single();

      // 记录拆单
      await db.from('order_splits').insert({
        original_order_id: order.id,
        split_order_a_id:  orderA?.id ?? null,
        split_order_b_id:  orderB?.id ?? null,
        original_amount:   order.amount,
        premium_amount:    Number(order.amount) - Number(order.cost_price ?? 0),
        threshold_used:    threshold,
        triggered_by:      triggeredBy,
        status:            'completed',
        note:              `订单金额 ¥${order.amount} 达到拆单阈值 ¥${threshold}，自动拆分为两笔各 ¥${subAmount} 的子订单`,
      });

      // 将原订单标记为已拆分
      await db.from('orders').update({ status: 'split' }).eq('id', order.id);

      // 写操作日志
      await db.from('admin_operation_logs').insert({
        operator_email: 'system',
        action:         'order_split',
        target_type:    'order',
        target_id:      order.id,
        detail:         `自动拆单：原始金额 ¥${order.amount}，阈值 ¥${threshold}，拆分为两笔各 ¥${subAmount}`,
        created_at:     now,
      });

      splitCount++;
      console.log(`[order-split-check] split order ${order.order_no}, amount=${order.amount}, each=${subAmount}`);
    }

    return new Response(JSON.stringify({ split: splitCount, threshold, sub_amount: subAmount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[order-split-check]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
