import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MobileHeader from '@/components/mobile/MobileHeader';
import BottomTabBar from '@/components/mobile/BottomTabBar';
import { ShoppingCart, Package, Upload } from 'lucide-react';

interface Order {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  buyer_id: string;
  seller_id: string;
  buyer: { real_name: string; nickname: string; phone: string } | null;
  seller: { real_name: string; nickname: string; phone: string } | null;
  products: { title: string; images: string[] } | null;
}

const STATUS_TABS = [
  { value: 'all', label: '全部' },
  { value: 'pending_payment', label: '待付款' },
  { value: 'payment_uploaded', label: '待确认' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending_payment: { label: '待付款', variant: 'destructive' },
  payment_uploaded: { label: '待确认', variant: 'default' },
  confirmed: { label: '已确认', variant: 'secondary' },
  completed: { label: '已完成', variant: 'secondary' },
  cancelled: { label: '已取消', variant: 'outline' },
  disputed: { label: '争议中', variant: 'destructive' },
};

export default function MOrdersPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => searchParams.get('status') ?? 'all');

  useEffect(() => {
    const s = searchParams.get('status');
    if (s) setTab(s);
  }, [searchParams]);

  useEffect(() => {
    if (!mobileUser) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from('orders')
      .select('id,order_no,amount,status,created_at,updated_at,buyer_id,seller_id,buyer:users!buyer_id(real_name,nickname,phone),seller:users!seller_id(real_name,nickname,phone),products!orders_product_id_fkey(title,images)')
      .or(`buyer_id.eq.${mobileUser.id},seller_id.eq.${mobileUser.id}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setOrders((data as unknown as Order[]) ?? []); setLoading(false); });
  }, [mobileUser?.id, location.pathname]);

  const filtered = tab === 'all' ? orders : orders.filter(o => o.status === tab);

  if (!mobileUser) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Button onClick={() => navigate('/m/login')}>请先登录</Button>
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-background pb-20">
      <MobileHeader title="我的订单" back />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full rounded-none border-b border-border bg-card h-auto px-2 pt-1 pb-0 justify-start gap-0 overflow-x-auto">
          {STATUS_TABS.map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="text-xs whitespace-nowrap rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map(t => (
          <TabsContent key={t.value} value={t.value} className="mt-0 px-4 py-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl mb-2" />)
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无订单</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(order => {
                  const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, variant: 'outline' as const };
                  const img = order.products && Array.isArray(order.products.images) && order.products.images.length > 0
                    ? order.products.images[0] : null;
                  const needsUpload = order.status === 'pending_payment';
                  return (
                     <div key={order.id} className="bg-card border border-border rounded-xl overflow-hidden">
                       <div className="p-3">
                         {/* 订单号 + 状态 */}
                         <div className="flex items-center justify-between mb-2">
                           <p className="text-xs text-muted-foreground truncate flex-1 min-w-0 mr-2 font-mono">
                             {order.order_no}
                           </p>
                           <Badge variant={statusInfo.variant} className="text-xs shrink-0">{statusInfo.label}</Badge>
                         </div>
                         {/* 商品行 */}
                         <div className="flex items-start gap-3">
                           <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                             {img ? <img src={img} alt={order.products?.title} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                               : <Package size={20} className="text-muted-foreground" />}
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-medium text-foreground truncate">{order.products?.title ?? '商品'}</p>
                             <p className="text-primary font-bold text-sm mt-0.5">商品价格：¥{Number(order.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</p>
                             {/* 卖家信息 */}
                             <div className="mt-1.5 space-y-0.5">
                               <div className="flex items-center gap-1.5">
                                 <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/90 text-white shrink-0">卖家</span>
                                 <span className="text-xs text-foreground">{order.seller?.real_name ?? order.seller?.nickname ?? '—'}</span>
                               </div>
                               <p className="text-xs text-muted-foreground pl-0.5">卖家电话：{order.seller?.phone ?? '-'}</p>
                               <div className="flex items-center gap-1.5 mt-0.5">
                                 <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white shrink-0">买家</span>
                                 <span className="text-xs text-foreground">{order.buyer?.real_name ?? order.buyer?.nickname ?? '—'}</span>
                               </div>
                               <p className="text-xs text-muted-foreground pl-0.5">买家电话：{order.buyer?.phone ?? '-'}</p>
                             </div>
                             {/* 时间 */}
                             <div className="mt-1.5 space-y-0.5">
                               <p className="text-[10px] text-muted-foreground">
                                 抢单时间：{order.created_at.replace('T', ' ').replace('Z', '').slice(0, 23)}
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
                       {/* 待付款操作条 */}
                       {needsUpload && (
                         <Link
                           to="/m/buy-warehouse?tab=pending_payment"
                           className="flex items-center justify-center gap-1.5 border-t border-border py-2 text-xs text-primary font-medium bg-primary/5 active:bg-primary/10"
                         >
                           <Upload size={13} />前往买单仓库上传付款凭证
                         </Link>
                       )}
                       {/* 交易详情按钮 */}
                       {!needsUpload && (
                         <div className="flex items-center justify-end px-3 py-2 border-t border-border">
                           <Link to={`/m/order/${order.id}`}>
                             <button className="text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 active:bg-destructive/80 px-4 py-1.5 rounded-lg transition-colors">
                               交易详情
                             </button>
                           </Link>
                         </div>
                       )}
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
    </>
  );
}
