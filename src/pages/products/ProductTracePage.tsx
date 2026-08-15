// 商品溯源查询 - 通过商品ID或订单号追溯完整流转链路
import { useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Package, ArrowRight, RefreshCw, User, ShoppingCart, Gift, Repeat2 } from 'lucide-react';

interface TraceProduct {
  id: string;
  title: string;
  generation: number;
  status: string;
  original_price: number;
  consignment_price: number;
  created_at: string;
  parent_product_id: string | null;
  seller: { phone: string; nickname: string } | null;
  category: { name: string } | null;
}

interface TraceOrder {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  buyer: { phone: string; nickname: string } | null;
  seller: { phone: string; nickname: string } | null;
}

interface TraceTransfer {
  id: string;
  type: 'resell' | 'gift';
  created_at: string;
  from_user: { phone: string; nickname: string } | null;
  to_user: { phone: string; nickname: string } | null;
}

interface TraceNode {
  product: TraceProduct;
  orders: TraceOrder[];
  transfers: TraceTransfer[];
}

const PRODUCT_STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: '待审核', cls: 'text-warning border-warning/40 bg-warning/10' },
  approved:  { label: '已上架', cls: 'text-green-700 border-green-300 bg-green-50' },
  rejected:  { label: '已驳回', cls: 'text-destructive border-destructive/30 bg-destructive/10' },
  sold:      { label: '已售出', cls: 'text-primary border-primary/30 bg-primary/10' },
  withdrawn: { label: '已下架', cls: 'text-muted-foreground border-border bg-muted/40' },
};

const ORDER_STATUS: Record<string, string> = {
  pending_payment:  '待付款',
  payment_uploaded: '凭证待确认',
  confirmed:        '已确认',
  completed:        '已完成',
  cancelled:        '已取消',
  disputed:         '争议中',
};

export default function ProductTracePage() {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState<TraceNode[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!keyword.trim()) { toast.error('请输入商品ID或订单号'); return; }
    setLoading(true);
    setChain([]);
    setSearched(true);

    try {
      // 先尝试通过订单号找商品
      let rootProductId: string | null = null;

      const trimmed = keyword.trim();

      // 尝试订单号查询
      const { data: orderHit } = await supabase
        .from('orders')
        .select('product_id')
        .ilike('order_no', `%${trimmed}%`)
        .limit(1)
        .maybeSingle();

      if (orderHit?.product_id) {
        rootProductId = orderHit.product_id;
      } else {
        // 直接用商品ID
        rootProductId = trimmed;
      }

      if (!rootProductId) { toast.error('未找到相关商品'); setLoading(false); return; }

      // 向上找根节点（通过 parent_product_id 链）
      let currentId = rootProductId;
      const visited = new Set<string>();
      while (true) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        const { data: p } = await supabase.from('products')
          .select('id,parent_product_id')
          .eq('id', currentId).maybeSingle();
        if (!p || !p.parent_product_id) break;
        currentId = p.parent_product_id;
      }
      const rootId = currentId;

      // 从根往下递归展开（BFS）
      const nodes: TraceNode[] = [];
      const queue: string[] = [rootId];
      const visitedNodes = new Set<string>();

      while (queue.length > 0) {
        const pid = queue.shift()!;
        if (visitedNodes.has(pid)) continue;
        visitedNodes.add(pid);

        // 获取商品基础信息
        const { data: prod } = await supabase.from('products')
          .select('id,title,generation,status,original_price,consignment_price,created_at,parent_product_id,seller:users(phone,nickname),category:product_categories(name)')
          .eq('id', pid).maybeSingle();
        if (!prod) continue;

        // 获取该商品的订单
        const { data: orders } = await supabase.from('orders')
          .select('id,order_no,amount,status,created_at,completed_at,buyer:buyer_id(phone,nickname),seller:seller_id(phone,nickname)')
          .eq('product_id', pid)
          .order('created_at');

        // 获取该商品的流转记录
        const { data: transfers } = await supabase.from('transfer_records')
          .select('id,type,created_at,from_user:from_user_id(phone,nickname),to_user:to_user_id(phone,nickname)')
          .eq('product_id', pid)
          .order('created_at');

        nodes.push({
          product: prod as unknown as TraceProduct,
          orders:  (orders as unknown as TraceOrder[]) ?? [],
          transfers: (transfers as unknown as TraceTransfer[]) ?? [],
        });

        // 查找子商品
        const { data: children } = await supabase.from('products')
          .select('id').eq('parent_product_id', pid);
        children?.forEach(c => { if (!visitedNodes.has(c.id)) queue.push(c.id); });
      }

      // 按 generation 排序
      nodes.sort((a, b) => (a.product.generation ?? 0) - (b.product.generation ?? 0));
      setChain(nodes);

      if (nodes.length === 0) {
        toast.error('未找到对应商品流转记录');
      } else {
        toast.success(`找到完整流转链路，共 ${nodes.length} 个节点`);
      }
    } catch (e: any) {
      toast.error('查询失败：' + (e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminLayout>
      <PageHeader
        title="商品溯源查询"
        description="通过商品ID或订单号检索商品完整流转链路，精准定位当前持有者"
      />

      {/* 搜索框 */}
      <div className="flex items-center gap-2 max-w-lg mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="输入商品ID或订单号（如：ORD-20240101-001）"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="pl-9 h-9 text-sm bg-muted border-border"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="h-9 px-5 text-sm gap-1.5">
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? '查询中...' : '查询'}
        </Button>
      </div>

      {/* 结果链路 */}
      {searched && chain.length === 0 && !loading && (
        <div className="bg-card border border-border rounded-sm py-16 text-center">
          <Package size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">未找到对应商品记录</p>
          <p className="text-xs text-muted-foreground mt-1">请确认商品ID或订单号是否正确</p>
        </div>
      )}

      {chain.length > 0 && (
        <div className="space-y-0">
          {chain.map((node, idx) => {
            const st = PRODUCT_STATUS[node.product.status] ?? PRODUCT_STATUS.pending;
            return (
              <div key={node.product.id} className="relative">
                {/* 连接线 */}
                {idx < chain.length - 1 && (
                  <div className="absolute left-6 top-full w-0.5 h-4 bg-border z-10" />
                )}

                <div className="bg-card border border-border rounded-sm p-4 mb-4">
                  {/* 商品头 */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center shrink-0">
                      <Package size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium text-foreground">{node.product.title}</h3>
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${st.cls}`}>{st.label}</Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5">第 {node.product.generation ?? 1} 代</Badge>
                      </div>
                      <div className="flex gap-4 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">ID: <span className="font-mono text-foreground">{node.product.id.slice(0, 12)}...</span></span>
                        <span className="text-xs text-muted-foreground">原价: <span className="text-foreground">¥{Number(node.product.original_price).toLocaleString()}</span></span>
                        <span className="text-xs text-muted-foreground">寄卖价: <span className="text-primary font-medium">¥{Number(node.product.consignment_price).toLocaleString()}</span></span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">寄卖方</p>
                      <p className="text-xs text-foreground">{node.product.seller?.nickname ?? '—'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{node.product.seller?.phone ?? '—'}</p>
                    </div>
                  </div>

                  {/* 订单记录 */}
                  {node.orders.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                        <ShoppingCart size={11} />关联订单 ({node.orders.length})
                      </p>
                      <div className="space-y-1.5">
                        {node.orders.map(o => (
                          <div key={o.id} className="flex items-center gap-3 bg-muted/30 rounded-sm px-3 py-1.5 flex-wrap">
                            <span className="font-mono text-xs text-foreground">{o.order_no}</span>
                            <Badge variant="outline" className="text-[10px] px-1">{ORDER_STATUS[o.status] ?? o.status}</Badge>
                            <span className="text-xs text-primary font-medium">¥{Number(o.amount).toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User size={10} />买: {o.buyer?.nickname ?? '—'} ({o.buyer?.phone ?? '—'})
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(o.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 流转记录 */}
                  {node.transfers.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Repeat2 size={11} />流转记录 ({node.transfers.length})
                      </p>
                      <div className="space-y-1.5">
                        {node.transfers.map(t => (
                          <div key={t.id} className="flex items-center gap-2 bg-muted/30 rounded-sm px-3 py-1.5 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] px-1 ${t.type === 'gift' ? 'border-purple-300 text-purple-700 bg-purple-50' : 'border-blue-300 text-blue-700 bg-blue-50'}`}>
                              {t.type === 'gift' ? <><Gift size={9} className="mr-0.5" />赠送</> : <><Repeat2 size={9} className="mr-0.5" />转拍</>}
                            </Badge>
                            <span className="text-xs text-foreground">{t.from_user?.nickname ?? '—'}</span>
                            <ArrowRight size={11} className="text-muted-foreground" />
                            <span className="text-xs text-foreground">{t.to_user?.nickname ?? '—'}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(t.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 节点间箭头 */}
                {idx < chain.length - 1 && (
                  <div className="flex items-center gap-2 px-4 mb-3">
                    <div className="flex-1 border-t border-dashed border-border" />
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <ArrowRight size={12} />流转至下一代
                    </span>
                    <div className="flex-1 border-t border-dashed border-border" />
                  </div>
                )}
              </div>
            );
          })}

          {/* 尾部 - 当前持有者 */}
          {chain.length > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-sm px-4 py-3 flex items-center gap-2">
              <User size={14} className="text-primary shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">
                  当前持有者：{chain[chain.length - 1].product.seller?.nickname ?? '—'}
                  （{chain[chain.length - 1].product.seller?.phone ?? '—'}）
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  商品状态：{PRODUCT_STATUS[chain[chain.length - 1].product.status]?.label ?? '未知'}
                  · 已完成 {chain.length - 1} 次流转
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
