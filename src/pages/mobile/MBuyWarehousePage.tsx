// 买单仓库：买家已购订单 / 上传支付凭证 / 转拍 / 赠送
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MobileHeader from '@/components/mobile/MobileHeader';
import BottomTabBar from '@/components/mobile/BottomTabBar';
import {
  Upload, RefreshCw, Package, Clock, CheckCircle2, Camera,
  ImagePlus, ZoomIn, X, Gift, ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';

interface BuyOrder {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  is_rush: boolean;
  payment_voucher_url: string | null;
  resell_price: number | null;
  resell_at: string | null;
  created_at: string;
  updated_at: string;
  seller_id: string;
  buyer: { real_name: string | null; nickname: string; phone: string; kyc_status: string } | null;
  seller: { real_name: string | null; nickname: string; phone: string; kyc_status: string } | null;
  products: { id: string; title: string; images: string[]; consignment_price: number } | null;
}

interface ConsignProduct {
  id: string;
  title: string;
  images: string[];
  consignment_price: number;
  status: string;
  is_active: boolean;
  created_at: string;
  order_status?: string | null; // 已售出商品对应的订单状态（待确认/已确认）
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending_payment:  { label: '待上传凭证', variant: 'destructive' },
  payment_uploaded: { label: '待确认收款', variant: 'default' },
  // 状态文案：confirmed = 已入库（买方可转拍/自用），completed = 已完成
  confirmed:        { label: '已入库',      variant: 'secondary' },
  resell_listed:    { label: '已转拍',       variant: 'outline' },
  completed:        { label: '已完成',       variant: 'outline' },
};

const TABS = [
  { value: 'all',              label: '全部' },
  { value: 'pending_payment',  label: '待付款' },
  { value: 'payment_uploaded', label: '待确认' },
  { value: 'confirmed',        label: '已入库' },
  { value: 'done',             label: '已完成' },   // 包含 resell_listed + completed，已转拍排前
  { value: 'my_consign',       label: '我的寄卖' },
];

// 判断当前时间是否可转拍（时间从系统配置动态读取，默认 14:30，周一至周五有效）
function canResellNow(startHour: number, startMinute: number) {
  const now = new Date();
  const day = now.getDay(); // 0=周日 6=周六
  if (day === 0 || day === 6) return false;
  return now.getHours() > startHour ||
    (now.getHours() === startHour && now.getMinutes() >= startMinute);
}

export default function MBuyWarehousePage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<BuyOrder[]>([]);
  const [consignProducts, setConsignProducts] = useState<ConsignProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // 若 URL 携带 tab 参数则自动切换（如从进货页跳转时传 ?tab=pending_payment）
  const [tab, setTab] = useState(() => searchParams.get('tab') ?? 'all');
  const [uploading, setUploading] = useState<string | null>(null);
  const [reselling, setReselling] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const camRefs  = useRef<Record<string, HTMLInputElement | null>>({});
  // 动态读取的转拍溢价率
  const [premiumRate, setPremiumRate] = useState(0.03);
  // 动态读取的转拍开始时间（默认 14:30）
  const [resellStart, setResellStart] = useState({ hour: 14, minute: 30, manualOverride: false });

  // 上传前本地预览（key = orderId）
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  // 待确认上传的文件（key = orderId），用户选图后先存这里，点「确认上传」才真正上传
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  // 大图预览
  const [zoomImg, setZoomImg] = useState('');
  // 赠送弹窗
  const [giftOrder, setGiftOrder] = useState<BuyOrder | null>(null);
  const [giftPhone, setGiftPhone] = useState('');
  const [gifting, setGifting] = useState(false);

  // 读取系统配置中的转拍溢价率 + 转拍开始时间 + 手动开关
  const loadPremiumRate = useCallback(async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('key,value')
      .in('key', ['resell_premium_rate', 'resell_start_hour', 'resell_start_minute', 'resell_manual_override']);
    if (!data) return;
    const map: Record<string, string> = {};
    data.forEach(r => { map[r.key] = r.value; });
    if (map['resell_premium_rate']) setPremiumRate(parseFloat(map['resell_premium_rate']) || 0.03);
    setResellStart({
      hour:   parseInt(map['resell_start_hour']   ?? '14') || 14,
      minute: parseInt(map['resell_start_minute'] ?? '30') || 30,
      manualOverride: map['resell_manual_override'] === 'true',
    });
  }, []);

  const load = useCallback(async () => {
    if (!mobileUser) { setLoading(false); return; }
    const [ordRes, prodRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id,order_no,amount,status,payment_voucher_url,resell_price,resell_at,created_at,updated_at,seller_id,buyer:users!buyer_id(real_name,nickname,phone,kyc_status),seller:users!seller_id(real_name,nickname,phone,kyc_status),products!orders_product_id_fkey(id,title,images,consignment_price)')
        .eq('buyer_id', mobileUser.id)
        .not('status', 'in', '("cancelled","disputed")')
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('id,title,images,consignment_price,status,is_active,created_at')
        .eq('seller_id', mobileUser.id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),  // 同时加载寄卖中与已售出商品，保证数量匹配
    ]);
    const prods = (prodRes.data as unknown as ConsignProduct[]) ?? [];
    // 为已售出商品补充订单状态（待确认/已确认）
    const soldIds = prods.filter(p => !p.is_active).map(p => p.id);
    let orderStatusMap: Record<string, string> = {};
    if (soldIds.length > 0) {
      const { data: soldOrders } = await supabase
        .from('orders')
        .select('product_id, status')
        .in('product_id', soldIds)
        .not('status', 'in', '("cancelled","disputed")');
      (soldOrders ?? []).forEach((o: { product_id: string; status: string }) => {
        orderStatusMap[o.product_id] = o.status;
      });
    }
    const prodsWithOrderStatus = prods.map(p => ({
      ...p,
      order_status: orderStatusMap[p.id] ?? null,
    })) as unknown as ConsignProduct[];
    setOrders((ordRes.data as unknown as BuyOrder[]) ?? []);
    setConsignProducts(prodsWithOrderStatus);
    setLoading(false);
  }, [mobileUser]);

  // 每次进入此页面或 mobileUser 就绪时重新加载
  useEffect(() => {
    setLoading(true);
    load();
    loadPremiumRate();
  }, [location.pathname, mobileUser?.id, load, loadPremiumRate]);

  // URL tab 参数变化时同步切换（进货成功后跳转自动切到待付款）
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t) setTab(t);
  }, [searchParams]);

  // ── 选图（仅预览，不上传）──
  function handlePickFile(orderId: string, file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('图片不能超过 10MB'); return; }
    const previewUrl = URL.createObjectURL(file);
    setLocalPreviews(prev => ({ ...prev, [orderId]: previewUrl }));
    setPendingFiles(prev => ({ ...prev, [orderId]: file }));
  }

  // ── 确认上传凭证 ──
  async function handleUploadVoucher(orderId: string) {
    const file = pendingFiles[orderId];
    if (!file) { toast.error('请先选择图片'); return; }
    setUploading(orderId);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `payment-vouchers/${mobileUser!.id}/${orderId}.${ext}`;
    const { error: upErr } = await supabase.storage.from('payment-vouchers').upload(path, file, { upsert: true });
    if (upErr) { toast.error('图片上传失败'); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from('payment-vouchers').getPublicUrl(path);
    const { error: updErr } = await supabase.from('orders').update({
      payment_voucher_url: urlData.publicUrl,
      status: 'payment_uploaded',
      payment_time: new Date().toISOString(),
    }).eq('id', orderId).eq('status', 'pending_payment');
    setUploading(null);
    if (updErr) { toast.error('状态更新失败'); return; }
    // 清除待上传文件（保留本地预览直到刷新）
    setPendingFiles(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    toast.success('凭证已上传，等待卖家确认收款');
    load();
  }

  // 转拍（转拍时间由系统配置决定，批量流转溢价模式，溢价率从系统配置读取）
  // 转拍商品价格 >= 拆单阈值时，自动平均拆分为 2 单（两个半价商品），否则创建单个商品
  async function handleResell(order: BuyOrder) {
    if (!resellStart.manualOverride && !canResellNow(resellStart.hour, resellStart.minute)) {
      const h = String(resellStart.hour).padStart(2, '0');
      const m = String(resellStart.minute).padStart(2, '0');
      toast.error(`转拍时间为每周一至周五 ${h}:${m} 之后，请届时操作`);
      return;
    }
    if (!order.products) { toast.error('找不到商品信息'); return; }
    setReselling(order.id);
    const rate = premiumRate;
    const resellPrice = Math.ceil(order.amount * (1 + rate) * 100) / 100;

    // 读取拆单配置：转拍商品价格 >= 阈值时自动平均拆分为 2 单
    const { data: splitCfgs } = await supabase
      .from('system_configs')
      .select('config_key, config_value')
      .in('config_key', ['order_split_threshold', 'order_split_enabled']);
    const splitMap: Record<string, string> = {};
    (splitCfgs ?? []).forEach((c: { config_key: string; config_value: string }) => { splitMap[c.config_key] = c.config_value; });
    const splitEnabled   = splitMap['order_split_enabled'] !== 'false';
    const splitThreshold = Number(splitMap['order_split_threshold'] ?? 20000);

    // 商品公共字段（转拍上架）
    const baseProduct = {
      seller_id: mobileUser!.id,
      title: order.products.title,
      images: order.products.images,
      consignment_fee: 0,
      storage_fee: 0,
      status: 'approved',
      is_active: true,
      generation: 1,
      origin_order_id: order.id,
      is_resell: true,
      resell_premium_rate: rate,
    };

    const shouldSplit = splitEnabled && resellPrice >= splitThreshold;
    const createdIds: string[] = [];
    let successMsg = '';

    if (shouldSplit) {
      // 平均拆分为 2 单：金额向下/向上取整，严禁小数，总和不变
      const totalInt = Math.round(resellPrice);
      const origInt  = Math.round(order.amount);
      const halfA = Math.floor(totalInt / 2);
      const halfB = totalInt - halfA;
      const origHalfA = Math.floor(origInt / 2);
      const origHalfB = origInt - origHalfA;

      const { data: prodA, error: errA } = await supabase.from('products').insert({
        ...baseProduct,
        title: `${order.products.title}（拆单A）`,
        original_price: origHalfA,
        consignment_price: halfA,
      }).select('id').single();
      if (errA) { toast.error('转拍拆分失败，请重试'); setReselling(null); return; }

      const { data: prodB, error: errB } = await supabase.from('products').insert({
        ...baseProduct,
        title: `${order.products.title}（拆单B）`,
        original_price: origHalfB,
        consignment_price: halfB,
      }).select('id').single();
      if (errB) { toast.error('转拍拆分失败，请重试'); setReselling(null); return; }

      createdIds.push(prodA.id, prodB.id);
      successMsg = `转拍成功！价格 ¥${resellPrice.toLocaleString()} 达到阈值 ¥${splitThreshold.toLocaleString()}，已自动拆分为两单（¥${halfA.toLocaleString()} / ¥${halfB.toLocaleString()}）`;
    } else {
      // 未达阈值：创建单个转拍商品
      const { data: newProd, error: prodErr } = await supabase.from('products').insert({
        ...baseProduct,
        original_price: order.amount,
        consignment_price: resellPrice,
      }).select('id').single();
      if (prodErr) { toast.error('转拍上架失败'); setReselling(null); return; }
      createdIds.push(newProd.id);
      successMsg = `转拍成功！上架价格 ¥${resellPrice.toLocaleString()}（溢价${(premiumRate * 100).toFixed(1)}%）`;
    }

    // 更新订单状态为已转拍
    await supabase.from('orders').update({
      status: 'resell_listed',
      resell_price: resellPrice,
      resell_at: new Date().toISOString(),
    }).eq('id', order.id);

    // 记录转拍记录（拆分时每条商品各记一条）
    for (const pid of createdIds) {
      await supabase.from('transfer_records').insert({
        type: 'resell',
        from_order_id: order.id,
        from_user_id: mobileUser!.id,
        product_id: pid,
      });
    }

    setReselling(null);
    toast.success(successMsg);
    load();
  }

  // ── 赠送商品 ──
  async function handleGift() {
    if (!giftOrder) return;
    const phone = giftPhone.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error('请输入有效的大陆手机号'); return; }
    setGifting(true);

    // 1. 按手机号查收件人
    const { data: recipient } = await supabase
      .from('users')
      .select('id, nickname, real_name, phone, kyc_status')
      .eq('phone', phone)
      .maybeSingle();

    if (!recipient) {
      toast.error('未找到该手机号对应的用户，请确认对方已注册');
      setGifting(false);
      return;
    }
    if (recipient.id === mobileUser!.id) {
      toast.error('不能赠送给自己');
      setGifting(false);
      return;
    }

    // 2. 将订单转移给受赠人（更改 buyer_id），并标记 completed
    const { error: orderErr } = await supabase
      .from('orders')
      .update({ buyer_id: recipient.id, status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', giftOrder.id)
      .eq('status', 'confirmed');

    if (orderErr) { toast.error('赠送失败，请重试'); setGifting(false); return; }

    // 3. 写转移记录
    await supabase.from('transfer_records').insert({
      type: 'gift',
      from_order_id: giftOrder.id,
      from_user_id: mobileUser!.id,
      to_user_id: recipient.id,
      product_id: giftOrder.products?.id ?? null,
    });

    // 4. 写状态日志
    await supabase.from('order_status_logs').insert({
      order_id: giftOrder.id,
      from_status: 'confirmed',
      to_status: 'completed',
      operator_type: 'buyer',
      operator_id: mobileUser!.id,
      remark: `赠送给 ${recipient.kyc_status === 'approved' && recipient.real_name ? recipient.real_name : (recipient.nickname ?? recipient.phone)}`,
    });

    setGifting(false);
    setGiftOrder(null);
    setGiftPhone('');
    toast.success(`已成功赠送给 ${recipient.kyc_status === 'approved' && recipient.real_name ? recipient.real_name : (recipient.nickname ?? recipient.phone)}！`);
    load();
  }

  // filtered 已移至每个 TabsContent 内部独立计算，避免多 TabsContent 共享同一列表导致 DOM removeChild 错误

  if (!mobileUser) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Button onClick={() => navigate('/m/login')}>请先登录</Button>
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-background pb-28">
        <MobileHeader title="买单仓库" back />

        {/* 流程说明 */}
        <div className="mx-4 mt-3 bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">操作流程</p>
          <p>{"① 9:30 进货（体验商家9:25）→ ② 上传\"已支付请确认\"图片 → ③ 等待卖家确认收款 → ④ 周一至周五 : 后点击\"转拍\"（批量流转溢价 %）"}</p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList className="w-full rounded-none border-b border-border bg-card h-auto px-2 pt-1 pb-0 justify-start gap-0 overflow-x-auto">
            {TABS.map(t => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="text-xs whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
              >
                {t.label}
                {t.value !== 'all' && t.value !== 'my_consign' && (() => {
                  const cnt = t.value === 'done'
                    ? orders.filter(o => o.status === 'resell_listed' || o.status === 'completed').length
                    : orders.filter(o => o.status === t.value).length;
                  return cnt > 0 ? (
                    <span className="ml-1 bg-primary text-primary-foreground text-[10px] rounded-full px-1">{cnt}</span>
                  ) : null;
                })()}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map(t => {
            // 每个 TabsContent 独立计算过滤列表，防止多个 TabsContent 共享同一列表时
            // React reconcile 阶段出现 "removeChild: node is not a child" 错误
            const tabFiltered = t.value === 'all' ? orders
              : t.value === 'my_consign' ? []
              : t.value === 'done'
                ? [...orders.filter(o => o.status === 'resell_listed'), ...orders.filter(o => o.status === 'completed')]
                : orders.filter(o => o.status === t.value);
            return (
            <TabsContent key={t.value} value={t.value} className="mt-0 px-4 py-3">
              {/* ── 我的寄卖 tab ── */}
              {t.value === 'my_consign' ? (
                loading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl mb-2" />)
                ) : consignProducts.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Package size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">暂无寄卖商品</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {consignProducts.map(p => {
                      const img = p.images?.[0] ?? null;
                      // 已售出商品按订单状态显示：待确认 / 已确认
                      const soldStatusLabel = p.order_status === 'confirmed'
                        ? '已确认'
                        : p.order_status === 'payment_uploaded' || p.order_status === 'pending_payment'
                          ? '待确认'
                          : '已售出';
                      const statusLabel =
                        p.status === 'approved' && p.is_active ? '寄卖中' :
                        p.status === 'approved' && !p.is_active ? soldStatusLabel :
                        p.status === 'pending' ? '审核中' :
                        p.status === 'rejected' ? '已拒绝' :
                        p.status === 'withdrawn' ? '已下架' : p.status;
                      const statusColor =
                        p.status === 'approved' && p.is_active ? 'text-green-600 bg-green-50 border-green-200' :
                        p.status === 'approved' && !p.is_active && p.order_status === 'confirmed' ? 'text-blue-600 bg-blue-50 border-blue-200' :
                        p.status === 'approved' && !p.is_active ? 'text-orange-600 bg-orange-50 border-orange-200' :
                        p.status === 'pending' ? 'text-orange-600 bg-orange-50 border-orange-200' :
                        'text-destructive bg-destructive/5 border-destructive/20';
                      return (
                        <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {img
                              ? <img src={img} alt={p.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <Package size={20} className="text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground line-clamp-1">{p.title}</p>
                            <p className="text-primary font-bold text-sm mt-0.5">¥{Number(p.consignment_price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(p.created_at).toLocaleString('zh-CN')}</p>
                          </div>
                          <span className={`text-[11px] px-2 py-0.5 rounded border font-medium shrink-0 ${statusColor}`}>{statusLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
              /* ── 普通订单 tab ── */
              (loading ? (Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl mb-2" />)) : tabFiltered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Package size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">暂无订单</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {t.value === 'done' && orders.some(o => o.status === 'resell_listed') && (
                    <div className="flex items-center gap-2 pt-1">
                      <RefreshCw size={13} className="text-primary" />
                      <span className="text-xs font-semibold text-primary">已转拍</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  {tabFiltered.map((order, idx) => {
                    // done tab 中间插入"已完成"分组线
                    const prevOrder = tabFiltered[idx - 1];
                    const showCompletedDivider = t.value === 'done'
                      && order.status === 'completed'
                      && (idx === 0 || prevOrder?.status === 'resell_listed');
                    const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, variant: 'outline' as const };
                    const img = order.products?.images?.[0] ?? null;
                    const isUploading = uploading === order.id;
                    const isReselling = reselling === order.id;
                    const voucherDisplay = localPreviews[order.id] || order.payment_voucher_url;

                    return (
                      <React.Fragment key={order.id}>
                        {showCompletedDivider && (
                          <div className="flex items-center gap-2 pt-1">
                            <CheckCircle2 size={13} className="text-muted-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground">已完成</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                      <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {/* 商品行 */}
                        <div className="p-3">
                          {/* 订单号 + 状态 */}
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs text-muted-foreground truncate flex-1 min-w-0 mr-2">
                              {order.order_no}
                            </p>
                            <Badge variant={statusInfo.variant} className="text-xs shrink-0">{statusInfo.label}</Badge>
                          </div>
                          {/* 商品信息行 */}
                          <div className="flex items-start gap-3">
                            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                              {img
                                ? <img src={img} alt={order.products?.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                : <Package size={24} className="text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{order.products?.title ?? '商品'}</p>
                              <p className="text-primary font-bold mt-1">¥{order.amount.toLocaleString()}</p>
                              {/* 卖家信息 */}
                              <div className="mt-1.5 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/90 text-white shrink-0">卖家</span>
                                  <span className="text-xs text-foreground truncate">{order.seller?.kyc_status === 'approved' && order.seller?.real_name ? order.seller.real_name : (order.seller?.nickname ?? '—')}</span>
                                </div>
                                {order.seller?.phone && (
                                  <p className="text-xs text-muted-foreground pl-0.5">卖家电话：{order.seller.phone}</p>
                                )}
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500 text-white shrink-0">买家</span>
                                  <span className="text-xs text-foreground truncate">{order.buyer?.kyc_status === 'approved' && order.buyer?.real_name ? order.buyer.real_name : (order.buyer?.nickname ?? '—')}</span>
                                </div>
                                {order.buyer?.phone && (
                                  <p className="text-xs text-muted-foreground pl-0.5">买家电话：{order.buyer.phone}</p>
                                )}
                              </div>
                              {/* 进货时间 + 更新时间 */}
                              <div className="mt-1.5 space-y-0.5">
                                <p className="text-[10px] text-muted-foreground">
                                  进货时间：{order.created_at.replace('T', ' ').replace('Z', '').slice(0, 23)}
                                </p>
                                {order.updated_at && order.updated_at !== order.created_at && (
                                  <p className="text-[10px] text-muted-foreground">
                                    更新时间：{order.updated_at.replace('T', ' ').replace('Z', '').slice(0, 23)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── 待付款：上传区 ── */}
                        {order.status === 'pending_payment' && (
                          <div className="border-t border-border px-3 pt-3 pb-3 space-y-2.5">
                            <p className="text-xs font-medium text-foreground">上传确认付款图片</p>

                            {/* 图片预览/占位区 */}
                            <button
                              type="button"
                              className="w-full aspect-[16/7] rounded-xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-2 overflow-hidden active:bg-muted/50 transition-colors relative"
                              onClick={() => fileRefs.current[order.id]?.click()}
                            >
                              {localPreviews[order.id] ? (
                                <>
                                  <img src={localPreviews[order.id]} alt="凭证预览" className="w-full h-full object-contain" />
                                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 active:opacity-100 transition-opacity">
                                    <p className="text-white text-xs font-medium">重新选择</p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <Upload size={24} className="text-muted-foreground" />
                                  <p className="text-xs text-muted-foreground">点击选择付款截图</p>
                                </>
                              )}
                            </button>

                            {/* 隐藏 file input：相册 */}
                            <input type="file" accept="image/*" className="hidden"
                              ref={el => { fileRefs.current[order.id] = el; }}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePickFile(order.id, f); e.target.value = ''; }} />
                            {/* 隐藏 file input：拍照 */}
                            <input type="file" accept="image/*" capture="environment" className="hidden"
                              ref={el => { camRefs.current[order.id] = el; }}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePickFile(order.id, f); e.target.value = ''; }} />

                            {/* 步骤1：未选图 → 拍照/相册两个按钮 */}
                            {!localPreviews[order.id] && (
                              <div className="grid grid-cols-2 gap-2">
                                <button type="button"
                                  onClick={() => camRefs.current[order.id]?.click()}
                                  className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-primary/10 text-primary text-sm font-medium active:bg-primary/20 transition-colors"
                                >
                                  <Camera size={15} />拍照上传
                                </button>
                                <button type="button"
                                  onClick={() => fileRefs.current[order.id]?.click()}
                                  className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-muted/60 text-foreground text-sm font-medium active:bg-muted transition-colors"
                                >
                                  <ImagePlus size={13} />相册选图
                                </button>
                              </div>
                            )}

                            {/* 步骤2：已选图（待确认）→ 显示「重新选择」+「确认上传」 */}
                            {localPreviews[order.id] && pendingFiles[order.id] && (
                              <div className="space-y-2">
                                <p className="text-[11px] text-primary text-center font-medium">图片已选好，确认后提交给卖家</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <button type="button"
                                    onClick={() => fileRefs.current[order.id]?.click()}
                                    disabled={isUploading}
                                    className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-muted/60 text-foreground text-sm font-medium active:bg-muted transition-colors disabled:opacity-50"
                                  >
                                    <ImagePlus size={13} />重新选择
                                  </button>
                                  <button type="button"
                                    onClick={() => handleUploadVoucher(order.id)}
                                    disabled={isUploading}
                                    className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium active:bg-primary/90 transition-colors disabled:opacity-60"
                                  >
                                    {isUploading
                                      ? <><RefreshCw size={13} className="animate-spin" />上传中…</>
                                      : <><Upload size={13} />确认上传</>}
                                  </button>
                                </div>
                              </div>
                            )}

                            <p className="text-[11px] text-muted-foreground text-center">请上传微信/支付宝/银行转账付款截图</p>
                          </div>
                        )}

                        {/* ── 已上传凭证：内嵌图片展示 ── */}
                        {order.status !== 'pending_payment' && voucherDisplay && (
                          <div className="border-t border-border px-3 pt-2.5 pb-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs text-muted-foreground font-medium">确认付款图片</p>
                              {order.status === 'payment_uploaded' && (
                                <span className="flex items-center gap-1 text-xs text-warning">
                                  <Clock size={11} />等待卖家确认收款
                                </span>
                              )}
                              {(order.status === 'confirmed' || order.status === 'resell_listed') && (
                                <span className="flex items-center gap-1 text-xs text-green-600">
                                  <CheckCircle2 size={11} />卖家已确认收款
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setZoomImg(voucherDisplay)}
                              className="w-full rounded-xl overflow-hidden border border-border bg-muted/20 relative"
                            >
                              <img src={voucherDisplay} alt="确认付款图片" className="w-full max-h-44 object-contain" />
                              <div className="absolute top-2 right-2 bg-black/40 rounded-full p-1">
                                <ZoomIn size={14} className="text-white" />
                              </div>
                            </button>
                            <p className="text-[11px] text-muted-foreground text-center mt-1">点击图片可放大查看</p>
                          </div>
                        )}

                        {/* ── 底部操作条 ── */}
                        <div className="border-t border-border px-3 py-2.5 flex items-center justify-end gap-2">
                          <div className="flex gap-2 shrink-0">
                            {order.status === 'confirmed' && (
                              <Button
                                size="sm" variant="outline"
                                className="h-8 text-xs gap-1.5"
                                disabled={isReselling}
                                onClick={async () => {
                                  await supabase.from('orders').update({
                                    status: 'completed', completed_at: new Date().toISOString(),
                                  }).eq('id', order.id);
                                  await supabase.from('order_status_logs').insert({
                                    order_id: order.id, from_status: 'confirmed', to_status: 'completed',
                                    operator_type: 'buyer', operator_id: mobileUser!.id, remark: '买方标记自用，交易完成',
                                  });
                                  toast.success('已标记自用，交易完成');
                                  load();
                                }}
                              >
                                自用完成
                              </Button>
                            )}
                            {order.status === 'confirmed' && (
                              <Button
                                size="sm" variant="outline"
                                className="h-8 text-xs gap-1.5"
                                disabled={isReselling}
                                onClick={() => { setGiftOrder(order); setGiftPhone(''); }}
                              >
                                <Gift size={12} />赠送
                              </Button>
                            )}
                            {order.status === 'confirmed' && (
                              <Button size="sm" className="h-8 text-xs gap-1.5" disabled={isReselling} onClick={() => handleResell(order)}>
                                {isReselling
                                  ? <><RefreshCw size={12} className="animate-spin" />转拍中…</>
                                  : <><RefreshCw size={12} />转拍上架</>}
                              </Button>
                            )}
                            {order.status === 'resell_listed' && (
                              <div className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 size={13} />已转拍 ¥{order.resell_price?.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )))}
            </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* 底部固定进货入口按钮 */}
      <div className="fixed bottom-16 left-0 right-0 px-4 py-2 bg-card/95 backdrop-blur border-t border-border z-30">
        <Button
          className="w-full h-11 text-base font-semibold gap-2"
          onClick={() => navigate('/m/rush')}
        >
          <ShoppingBag size={18} />去进货
        </Button>
      </div>

      <BottomTabBar />
      {/* 大图预览 */}
      <Dialog open={!!zoomImg} onOpenChange={open => { if (!open) setZoomImg(''); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] p-2 bg-black border-0">
          <button
            onClick={() => setZoomImg('')}
            className="absolute top-3 right-3 z-10 bg-black/60 rounded-full p-1.5"
          >
            <X size={18} className="text-white" />
          </button>
          <div className="flex items-center justify-center min-h-40 max-h-[80vh] overflow-auto">
            <img src={zoomImg} alt="付款凭证" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
          </div>
        </DialogContent>
      </Dialog>
      {/* 赠送弹窗 */}
      <Dialog open={!!giftOrder} onOpenChange={open => { if (!open) { setGiftOrder(null); setGiftPhone(''); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift size={16} className="text-primary" />赠送商品
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {giftOrder?.products && (
              <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                {giftOrder.products.images?.[0] && (
                  <img src={giftOrder.products.images[0]} className="w-12 h-12 rounded object-cover shrink-0" alt="" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{giftOrder.products.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">成交价 ¥{giftOrder.amount.toLocaleString()}</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">受赠人手机号</Label>
              <Input
                type="tel"
                placeholder="输入对方注册手机号"
                value={giftPhone}
                onChange={e => setGiftPhone(e.target.value)}
                maxLength={11}
                className="text-base"
              />
              <p className="text-xs text-muted-foreground">对方需已注册本平台账号，赠送后商品将转入对方仓库</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setGiftOrder(null); setGiftPhone(''); }}>
                取消
              </Button>
              <Button className="flex-1 gap-2" disabled={gifting} onClick={handleGift}>
                {gifting ? '赠送中…' : <><Gift size={14} />确认赠送</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
