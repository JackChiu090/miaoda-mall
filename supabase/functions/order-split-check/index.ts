// order-split-check: 单笔流转溢价达到阈值时，自动将订单平均拆分为两个等额子订单，并投放到寄卖商品列表
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderRow {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  buyer_id: string | null;
  seller_id: string | null;
  product_id: string | null;
  products?: {
    title?: string | null;
    images?: unknown;
    original_price?: number | null;
    generation?: number | null;
    condition?: string | null;
    specs?: unknown;
    category_id?: string | null;
  } | null;
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

    // 阈值：单笔流转溢价（订单金额 - 商品原价）>= threshold 时自动拆分为两单
    const threshold = Number(cfgMap.order_split_threshold ?? 30000);
    const now       = new Date().toISOString();

    // 查找已支付/已完成的订单（含转拍上架），并关联商品原价信息
    let ordersQuery = db
      .from('orders')
      .select('id, order_no, amount, status, buyer_id, seller_id, product_id, products!orders_product_id_fkey(title, images, original_price, generation, condition, specs, category_id)')
      .in('status', ['confirmed', 'completed', 'resell_listed', 'paid']);

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
    for (const order of candidates as OrderRow[]) {
      if (alreadySplit.has(order.id)) continue;

      // 流转溢价 = 订单金额 - 商品原价（成本基准）
      const costPrice = Number(order.products?.original_price ?? 0);
      const premium = Number(order.amount) - costPrice;
      if (premium < threshold) continue; // 溢价未达阈值，不拆单

      // ── 金额取整：平均拆分为两笔整数金额，向下/向上取整，确保总和不变、无小数 ──
      const totalInt = Math.round(Number(order.amount)); // 四舍五入取整（严禁小数）
      const subA = Math.floor(totalInt / 2);             // 向下取整
      const subB = totalInt - subA;                       // 向上取整（余数）
      const costHalfA = Math.floor(costPrice / 2);
      const costHalfB = costPrice - costHalfA;

      const images = Array.isArray(order.products?.images) ? order.products!.images : [];
      const title = order.products?.title ?? '商品';
      const baseProductPayload = {
        seller_id:         order.seller_id,
        images,
        original_price:    0,
        consignment_price: 0,
        consignment_fee:   0,
        storage_fee:       0,
        status:            'approved',
        is_active:         true,
        generation:        Number(order.products?.generation ?? 1),
        condition:         order.products?.condition ?? '全新',
        specs:             order.products?.specs ?? {},
        category_id:       order.products?.category_id ?? null,
        parent_product_id: order.product_id,
        origin_order_id:   order.id,
        is_resell:         true,
        resell_premium_rate: 0.03,
      };

      // ── 创建 2 个寄卖商品（投放寄卖商品列表，供下一轮流通） ──
      const { data: prodA } = await db.from('products').insert({
        ...baseProductPayload,
        title:             `${title}（拆单A）`,
        original_price:    costHalfA,
        consignment_price: subA,
      }).select('id').single();

      const { data: prodB } = await db.from('products').insert({
        ...baseProductPayload,
        title:             `${title}（拆单B）`,
        original_price:    costHalfB,
        consignment_price: subB,
      }).select('id').single();

      // ── 创建 2 个子订单（指向新拆出的商品） ──
      const { data: orderA } = await db.from('orders').insert({
        order_no:   `${order.order_no}-A`,
        amount:     subA,
        status:     order.status,
        buyer_id:   order.buyer_id,
        seller_id:  order.seller_id,
        product_id: prodA?.id ?? null,
      }).select('id').single();

      const { data: orderB } = await db.from('orders').insert({
        order_no:   `${order.order_no}-B`,
        amount:     subB,
        status:     order.status,
        buyer_id:   order.buyer_id,
        seller_id:  order.seller_id,
        product_id: prodB?.id ?? null,
      }).select('id').single();

      // 拆出的新商品需保持「寄卖中」，覆盖订单插入触发器导致的 is_active=false
      await db.from('products').update({ is_active: true })
        .in('id', [prodA?.id, prodB?.id].filter(Boolean) as string[]);

      // ── 记录拆单 ──
      await db.from('order_splits').insert({
        original_order_id: order.id,
        split_order_a_id:  orderA?.id ?? null,
        split_order_b_id:  orderB?.id ?? null,
        original_amount:   order.amount,
        premium_amount:    premium,
        threshold_used:    threshold,
        triggered_by:      triggeredBy,
        status:            'completed',
        note:              `流转溢价 ¥${premium.toFixed(2)} 达到阈值 ¥${threshold}，自动拆分为两笔各 ¥${subA} / ¥${subB}`,
      });

      // ── 原订单标记为已拆分 ──
      await db.from('orders').update({ status: 'split' }).eq('id', order.id);

      // ── 写操作日志 ──
      await db.from('admin_operation_logs').insert({
        operator_email: 'system',
        action:         'order_split',
        target_type:    'order',
        target_id:      order.id,
        detail:         `自动拆单：流转溢价 ¥${premium.toFixed(2)}，阈值 ¥${threshold}，拆分为两笔 ¥${subA} / ¥${subB}`,
        created_at:     now,
      });

      splitCount++;
      console.log(`[order-split-check] split order ${order.order_no}, premium=${premium}, each=${subA}/${subB}`);
    }

    return new Response(JSON.stringify({ split: splitCount, threshold }), {
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
