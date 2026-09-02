// 卖单仓库：卖家待确认收款订单列表
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import MobileHeader from '@/components/mobile/MobileHeader';
import BottomTabBar from '@/components/mobile/BottomTabBar';
import {
  Package, CheckCircle2, RefreshCw, Clock, ZoomIn, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { settleSellerEarnings } from '@/lib/settlement';
import { useSubmitLock } from '@/hooks/use-submit-lock';

interface SellOrder {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  payment_voucher_url: string | null;
  confirmed_at: string | null;
  created_at: string;
  product_id: string | null;
  buyer_id: string | null;
  products: { id: string; title: string; images: string[] } | null;
  buyer: { phone: string; nickname: string; real_name: string | null; kyc_status: string } | null;
}

interface ConsignProduct {
  id: string;
  title: string;
  images: string[];
  consignment_price: number;
  created_at: string;
  seller: { real_name: string | null; phone: string }[] | null;
  orders: { buyer_id: string | null; buyer: { real_name: string | null; phone: string }[] | null }[];
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending_payment:  { label: '等待买家付款', variant: 'outline' },
  payment_uploaded: { label: '待确认收款',    variant: 'destructive' },
  confirmed:        { label: '已确认收款',    variant: 'secondary' },
  resell_listed:    { label: '买家已转拍',     variant: 'outline' },
  completed:        { label: '已完成',         variant: 'outline' },
};

const TABS = [
  { value: 'all',              label: '全部' },
  { value: 'consign_active',   label: '寄卖中' },   // products 表中 approved+is_active
  { value: 'pending_payment',  label: '待付款' },
  { value: 'payment_uploaded', label: '待确认' },
  { value: 'confirmed',        label: '已确认' },
];

export default function MSellWarehousePage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<SellOrder[]>([]);
  const [consignProducts, setConsignProducts] = useState<ConsignProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => searchParams.get('tab') ?? 'all');
  const { tryLock, unlock, isPending } = useSubmitLock();
  const [pendingConfirm, setPendingConfirm] = useState<SellOrder | null>(null);
  // 大图预览
  const [zoomImg, setZoomImg] = useState('');

  // URL tab 参数变化时同步切换
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t) setTab(t);
  }, [searchParams]);

  async function load() {
    if (!mobileUser) { setLoading(false); return; }
    const [ordersRes, consignRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id,order_no,amount,status,payment_voucher_url,confirmed_at,created_at,product_id,buyer_id,products!orders_product_id_fkey(title,images),buyer:users!buyer_id(phone,nickname,real_name,kyc_status)')
        .eq('seller_id', mobileUser.id)
        .not('status', 'in', '("cancelled","disputed")')
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select('id,title,images,consignment_price,created_at,seller:users!seller_id(real_name,phone),orders!orders_product_id_fkey(buyer_id,buyer:users!buyer_id(real_name,phone))')
        .eq('seller_id', mobileUser.id)
        .eq('status', 'approved')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ]);
    setOrders((ordersRes.data as unknown as SellOrder[]) ?? []);
    setConsignProducts((consignRes.data as unknown as ConsignProduct[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [mobileUser?.id]);

  async function handleConfirmReceipt(order: SellOrder) {
    if (!tryLock(order.id)) return;
    try {
      // 1. 更新订单状态为已确认
      const { error } = await supabase.from('orders').update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      }).eq('id', order.id).eq('status', 'payment_uploaded');
      if (error) { setPendingConfirm(null); toast.error('操作失败，请重试'); return; }

      // 2. 写状态流转日志
      await supabase.from('order_status_logs').insert({
        order_id: order.id, from_status: 'payment_uploaded', to_status: 'confirmed',
        operator_type: 'seller', operator_id: mobileUser!.id, remark: '卖方确认收款',
      });

      // 3. 结算卖方收益 + 分润分配（含直接奖励：推荐链路10点前递推，统一在此发放）
      const { netAmount, serviceFee } = await settleSellerEarnings({
        orderId: order.id, sellerId: mobileUser!.id,
        buyerId: order.buyer_id ?? '',
        orderAmount: order.amount,
      });

      setPendingConfirm(null);
      toast.success(`已确认收款！净收益 ¥${netAmount.toLocaleString()}（服务费 ¥${serviceFee.toLocaleString()}）`);
      load();
    } finally {
      unlock(order.id);
    }
  }

  const filtered = tab === 'all' ? orders
    : tab === 'consign_active' ? []
    : orders.filter(o => o.status === tab);

  if (!mobileUser) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Button onClick={() => navigate('/m/login')}>请先登录</Button>
    </div>
  );

  return (
    <>
      <div className="min-h-screen bg-background pb-20">
        <MobileHeader title="卖单仓库" back />

        {/* 流程说明 */}
        <div className="mx-4 mt-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">卖方操作流程</p>
          <p>等待买家上传付款凭证 → 核实到账后点击"确认收款" → 买家将于14:30进行转拍操作</p>
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
                {t.value === 'payment_uploaded' && orders.filter(o => o.status === 'payment_uploaded').length > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground text-[10px] rounded-full px-1">
                    {orders.filter(o => o.status === 'payment_uploaded').length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map(t => (
            <TabsContent key={t.value} value={t.value} className="mt-0 px-4 py-3">
              {/* ── 寄卖中 tab：展示商品明细 ── */}
              {t.value === 'consign_active' ? (
                loading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl mb-2" />)
                ) : consignProducts.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Package size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">暂无寄卖中商品</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {consignProducts.map(p => {
                      const img = p.images?.[0] ?? null;
                      // 取最新一条订单的买家信息
                      const buyerOrder = p.orders?.[0] ?? null;
                      const buyerInfo  = Array.isArray(buyerOrder?.buyer) ? buyerOrder.buyer[0] : buyerOrder?.buyer ?? null;
                      const buyerName  = buyerInfo?.real_name ?? '-';
                      const buyerPhone = buyerInfo?.phone ?? '-';
                      const sellerInfo  = Array.isArray(p.seller) ? p.seller[0] : p.seller ?? null;
                      const sellerName  = sellerInfo?.real_name ?? '-';
                      const sellerPhone = sellerInfo?.phone ?? '-';
                      return (
                        <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex items-start gap-3">
                          {/* 左：商品图 */}
                          <div className="w-20 h-20 rounded-lg bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                            {img
                              ? <img src={img} alt={p.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <Package size={24} className="text-muted-foreground" />}
                          </div>
                          {/* 右：信息区 */}
                          <div className="flex-1 min-w-0">
                            {/* 标题行：商品名 + 寄卖中标签 */}
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground line-clamp-1 flex-1 min-w-0">{p.title}</p>
                              <span className="text-[11px] px-2 py-0.5 rounded border font-medium shrink-0 text-green-600 bg-green-50 border-green-200">寄卖中</span>
                            </div>
                            {/* 价格 */}
                            <p className="text-sm font-bold text-primary mt-0.5">
                              商品价格：¥{Number(p.consignment_price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                            </p>
                            {/* 卖家 */}
                            <div className="flex items-center gap-1 mt-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/90 text-white shrink-0">卖</span>
                              <span className="text-xs text-foreground">{sellerName}</span>
                            </div>
                            <p className="text-xs text-muted-foreground ml-[22px]">卖家电话：{sellerPhone}</p>
                            {/* 买家 */}
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white shrink-0">买</span>
                              <span className="text-xs text-foreground">{buyerName}</span>
                            </div>
                            <p className="text-xs text-muted-foreground ml-[22px]">买家电话：{buyerPhone}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl mb-2" />)
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Package size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">暂无订单</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(order => {
                    const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, variant: 'outline' as const };
                    const img = order.products?.images?.[0] ?? null;
                    const isConfirming = isPending(order.id);

                    return (
                      <div key={order.id} className="bg-card border border-border rounded-xl overflow-hidden">
                        {/* 商品行 */}
                        <div className="flex items-center gap-3 p-3">
                          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {img
                              ? <img src={img} alt={order.products?.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <Package size={24} className="text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{order.products?.title ?? '商品'}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              买家：{order.buyer?.kyc_status === 'approved' && order.buyer?.real_name ? order.buyer.real_name : (order.buyer?.nickname || order.buyer?.phone || '-')}
                            </p>
                            <p className="text-primary font-bold mt-0.5">¥{order.amount.toLocaleString()}</p>
                          </div>
                          <Badge variant={statusInfo.variant} className="text-xs shrink-0">{statusInfo.label}</Badge>
                        </div>

                        {/* ── 买家已上传付款图片：内嵌展示 ── */}
                        {order.payment_voucher_url && (
                          <div className="border-t border-border px-3 pt-2.5 pb-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-medium text-foreground">买家确认付款图片</p>
                              {order.status === 'payment_uploaded' && (
                                <span className="text-[11px] text-destructive font-medium">需核实到账后确认</span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setZoomImg(order.payment_voucher_url!)}
                              className="w-full rounded-xl overflow-hidden border border-border bg-muted/20 relative"
                            >
                              <img
                                src={order.payment_voucher_url}
                                alt="买家付款图片"
                                className="w-full max-h-52 object-contain"
                              />
                              <div className="absolute top-2 right-2 bg-black/40 rounded-full p-1.5">
                                <ZoomIn size={14} className="text-white" />
                              </div>
                            </button>
                            <p className="text-[11px] text-muted-foreground text-center mt-1">点击图片可放大查看</p>
                          </div>
                        )}

                        {/* ── 底部操作条 ── */}
                        <div className="border-t border-border px-3 py-2.5 flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* 待确认：确认收款按钮 */}
                            {order.status === 'payment_uploaded' && (
                              <Button
                                size="sm"
                                className="h-9 px-4 text-sm gap-1.5"
                                disabled={isConfirming}
                                onClick={() => setPendingConfirm(order)}
                              >
                                {isConfirming
                                  ? <><RefreshCw size={13} className="animate-spin" />确认中…</>
                                  : <><CheckCircle2 size={13} />确认收款</>}
                              </Button>
                            )}

                            {/* 等待买家 */}
                            {order.status === 'pending_payment' && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock size={12} />等待买家付款
                              </span>
                            )}

                            {/* 已确认 */}
                            {(order.status === 'confirmed' || order.status === 'resell_listed') && (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 size={12} />
                                已确认 {order.confirmed_at
                                  ? new Date(order.confirmed_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                                  : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <BottomTabBar />

      {/* 确认收款确认框 */}
      <AlertDialog open={!!pendingConfirm} onOpenChange={open => { if (!open) setPendingConfirm(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认已收款？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  请确认您已在实际账户中收到买家付款
                  <span className="font-semibold text-foreground"> ¥{pendingConfirm?.amount.toLocaleString()}</span>，
                  确认后买家将可进行转拍操作。此操作不可撤销。
                </p>
                {/* 内嵌付款图片 */}
                {pendingConfirm?.payment_voucher_url && (
                  <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
                    <p className="text-xs text-muted-foreground px-3 pt-2 pb-1">买家上传的付款图片：</p>
                    <button
                      type="button"
                      onClick={() => setZoomImg(pendingConfirm.payment_voucher_url!)}
                      className="w-full relative"
                    >
                      <img
                        src={pendingConfirm.payment_voucher_url}
                        alt="买家付款图片"
                        className="w-full max-h-48 object-contain"
                      />
                      <div className="absolute top-2 right-2 bg-black/40 rounded-full p-1.5">
                        <ZoomIn size={14} className="text-white" />
                      </div>
                    </button>
                    <p className="text-[11px] text-muted-foreground text-center py-1.5">点击图片可放大</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingConfirm && handleConfirmReceipt(pendingConfirm)}
              disabled={!!pendingConfirm && isPending(pendingConfirm.id)}
            >
              {pendingConfirm && isPending(pendingConfirm.id) ? '确认中…' : '确认收款'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <img src={zoomImg} alt="付款图片" className="max-w-full max-h-[80vh] object-contain rounded-lg" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
