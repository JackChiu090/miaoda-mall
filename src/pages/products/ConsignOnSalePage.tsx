import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, RefreshCw, Package } from 'lucide-react';

interface OnSaleItem {
  id: string;
  title: string;
  consignment_price: number;
  images: string[];
  seller_name: string;
  seller_phone: string;
  buyer_name: string;
  buyer_phone: string;
  created_at: string;
  order_no: string | null;
}

const PAGE_SIZE = 20;

export default function ConsignOnSalePage() {
  const [items,   setItems]   = useState<OnSaleItem[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;

    // 查 approved + is_active 的商品，关联卖家
    let q = supabase
      .from('products')
      .select('id, title, consignment_price, images, created_at, seller_id, seller:seller_id(real_name,nickname,phone)', { count: 'exact' })
      .eq('status', 'approved')
      .eq('is_active', true);

    if (search.trim()) q = q.ilike('title', `%${search.trim()}%`);

    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) { toast.error('加载失败：' + error.message); setLoading(false); return; }

    const productList = (data ?? []) as any[];

    // 查这批商品中正在寄卖（pending 状态）的订单以获取买家信息
    const productIds = productList.map(p => p.id);
    let orderMap: Record<string, { order_no: string; buyer_id: string }> = {};
    if (productIds.length > 0) {
      const { data: orderData } = await supabase
        .from('orders')
        .select('product_id, order_no, buyer_id')
        .in('product_id', productIds)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });
      (orderData ?? []).forEach((o: any) => {
        if (!orderMap[o.product_id]) orderMap[o.product_id] = { order_no: o.order_no, buyer_id: o.buyer_id };
      });
    }

    // 批量查买家信息
    const buyerIds = [...new Set(Object.values(orderMap).map(o => o.buyer_id).filter(Boolean))];
    const buyerMap: Record<string, { real_name: string; phone: string }> = {};
    if (buyerIds.length > 0) {
      const { data: bData } = await supabase.from('users').select('id, real_name, phone').in('id', buyerIds);
      (bData ?? []).forEach((u: any) => { buyerMap[u.id] = u; });
    }

    const result: OnSaleItem[] = productList.map(p => {
      const orderInfo = orderMap[p.id];
      const buyer = orderInfo ? buyerMap[orderInfo.buyer_id] : null;
      return {
        id: p.id,
        title: p.title,
        consignment_price: Number(p.consignment_price),
        images: Array.isArray(p.images) ? p.images : [],
        seller_name: (p.seller as any)?.real_name ?? (p.seller as any)?.nickname ?? '-',
        seller_phone: (p.seller as any)?.phone ?? '-',
        buyer_name: buyer?.real_name ?? '-',
        buyer_phone: buyer?.phone ?? '-',
        created_at: p.created_at,
        order_no: orderInfo?.order_no ?? null,
      };
    });

    setItems(result);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader
        title="寄卖中"
        description={`共 ${total} 件正在寄卖的商品`}
        action={
          <Button size="sm" variant="ghost" onClick={fetchItems}
            className="h-8 gap-1.5 text-xs border border-border">
            <RefreshCw size={13} />刷新
          </Button>
        }
      />

      {/* 搜索栏 */}
      <div className="relative max-w-sm mb-5">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="搜索商品名称"
          className="pl-8 h-8 text-xs bg-muted border-border"
        />
      </div>

      {/* 卡片列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">加载中...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground gap-2">
          <Package size={32} className="opacity-30" />
          暂无寄卖中的商品
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const img = item.images[0] ?? null;
            return (
              <div key={item.id} className="relative flex items-start gap-3 bg-card border border-border rounded-lg p-3 hover:bg-muted/20 transition-colors">
                {/* 右上角状态标签 */}
                <span className="absolute top-3 right-3 text-[11px] px-2 py-0.5 rounded-sm bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-700 font-medium">
                  寄卖中
                </span>

                {/* 商品图片 */}
                <div className="w-20 h-20 shrink-0 rounded-md overflow-hidden bg-muted border border-border">
                  {img
                    ? <img src={img} alt={item.title} className="w-full h-full object-cover" />
                    : <Package size={20} className="m-auto mt-6 text-muted-foreground/30" />
                  }
                </div>

                {/* 右侧信息 */}
                <div className="flex-1 min-w-0 pr-16">
                  {/* 商品名称 */}
                  <p className="text-sm font-medium text-foreground leading-snug line-clamp-1 mb-1">
                    {item.title}
                  </p>
                  {/* 商品价格 */}
                  <p className="text-sm font-bold text-primary mb-2">
                    商品价格：<span className="text-base">¥{item.consignment_price.toFixed(2)}</span>
                  </p>

                  {/* 卖家信息 */}
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-[11px] px-1.5 py-0 h-5 bg-primary/90 text-primary-foreground rounded-sm shrink-0">
                      卖家
                    </Badge>
                    <span className="text-xs text-foreground">{item.seller_name}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-muted-foreground">卖家电话：{item.seller_phone}</span>
                  </div>

                  {/* 买家信息（有则显示，无则显示 - ） */}
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-[11px] px-1.5 py-0 h-5 bg-blue-500 text-white rounded-sm shrink-0">
                      买家
                    </Badge>
                    <span className="text-xs text-foreground">{item.buyer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">买家电话：{item.buyer_phone}</span>
                  </div>

                  {/* 订单号（有则显示） */}
                  {item.order_no && (
                    <div className="mt-1.5">
                      <span className="text-[11px] text-muted-foreground font-mono">订单号：{item.order_no}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 text-xs text-muted-foreground">
          <span>共 {total} 件，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            {[...Array(Math.min(totalPages, 7))].map((_, i) => {
              const p = i + 1;
              return (
                <Button key={p} variant={p === page ? 'default' : 'ghost'} size="sm"
                  onClick={() => setPage(p)}
                  className="h-7 w-7 p-0 text-xs">
                  {p}
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
