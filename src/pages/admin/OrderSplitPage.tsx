// 拆单管理：拆单记录查看 + 关联链追溯
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Scissors, RefreshCw, Search, Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';

interface SplitRecord {
  id: string;
  original_order_id: string;
  split_order_a_id: string | null;
  split_order_b_id: string | null;
  original_amount: number;
  premium_amount: number;
  threshold_used: number;
  triggered_by: string;
  status: string;
  note: string | null;
  created_at: string;
}

interface OrderDetail {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  buyer_id: string | null;
  seller_id: string | null;
}

export default function OrderSplitPage() {
  const [splits, setSplits] = useState<SplitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detailSplit, setDetailSplit] = useState<SplitRecord | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [threshold, setThreshold] = useState(20000);

  async function load() {
    setLoading(true);
    const [{ data: sData }, { data: cData }] = await Promise.all([
      supabase.from('order_splits').select('*').order('created_at', { ascending: false }),
      supabase.from('system_configs').select('config_value').eq('config_key', 'order_split_threshold').maybeSingle(),
    ]);
    setSplits((sData as SplitRecord[]) ?? []);
    if (cData) setThreshold(Number(cData.config_value));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function openDetail(split: SplitRecord) {
    setDetailSplit(split);
    setDetailLoading(true);
    const ids = [split.original_order_id, split.split_order_a_id, split.split_order_b_id].filter(Boolean) as string[];
    const { data } = await supabase.from('orders').select('id,order_no,amount,status,buyer_id,seller_id').in('id', ids);
    const map: Record<string, OrderDetail> = {};
    (data ?? []).forEach((o: OrderDetail) => { map[o.id] = o; });
    setOrderDetails(map);
    setDetailLoading(false);
  }

  async function handleManualSplit(orderId: string) {
    const { error } = await supabase.functions.invoke('order-split-check', {
      body: { order_id: orderId, triggered_by: 'manual' },
    });
    if (error) { toast.error('手动触发失败'); return; }
    toast.success('拆单任务已触发');
    load();
  }

  const filtered = splits.filter(s =>
    !search
    || s.original_order_id.includes(search)
    || (s.split_order_a_id ?? '').includes(search)
    || (s.split_order_b_id ?? '').includes(search)
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="拆单管理"
        description={`当前触发阈值：转拍商品价格 ≥ ¥${threshold.toLocaleString()} 时，自动平均拆分为两单（金额四舍五入取整，拆分商品进入寄卖列表）`}
        action={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw size={14} />刷新
          </Button>
        }
      />

      {/* 搜索 */}
      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索订单ID…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 列表 */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>原订单ID</TableHead>
              <TableHead className="whitespace-nowrap">原始金额</TableHead>
              <TableHead className="whitespace-nowrap">溢价金额</TableHead>
              <TableHead className="whitespace-nowrap">触发阈值</TableHead>
              <TableHead>触发方式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="whitespace-nowrap">拆单时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  暂无拆单记录
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs max-w-[120px] truncate" title={s.original_order_id}>
                    {s.original_order_id.slice(0, 8)}…
                  </TableCell>
                  <TableCell className="whitespace-nowrap">¥{Number(s.original_amount).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap text-destructive font-semibold">
                    +¥{Number(s.premium_amount).toLocaleString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    ¥{Number(s.threshold_used).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.triggered_by === 'manual' ? 'default' : 'secondary'} className="text-xs">
                      {s.triggered_by === 'manual' ? '手动' : '自动'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={s.status === 'completed' ? 'outline' : s.status === 'failed' ? 'destructive' : 'default'}
                      className="text-xs"
                    >
                      {s.status === 'completed' ? '已完成' : s.status === 'failed' ? '失败' : '处理中'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {new Date(s.created_at).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => openDetail(s)}>
                      <Link2 size={11} />追溯
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 详情弹窗 */}
      <Dialog open={!!detailSplit} onOpenChange={open => { if (!open) setDetailSplit(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Scissors size={16} />拆单详情 & 关联链</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* 原订单 */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">原始订单</p>
                {detailSplit && orderDetails[detailSplit.original_order_id] ? (
                  <OrderCard order={orderDetails[detailSplit.original_order_id]} tag="原单" />
                ) : (
                  <p className="text-sm text-muted-foreground">ID: {detailSplit?.original_order_id?.slice(0, 12)}…</p>
                )}
              </div>

              {/* 拆分后 */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex-1 h-px bg-border" />
                <div className="flex items-center gap-1 text-xs">
                  <Scissors size={11} />拆分为两单
                </div>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: detailSplit?.split_order_a_id, tag: '子单 A' },
                  { id: detailSplit?.split_order_b_id, tag: '子单 B' },
                ].map(({ id, tag }) => (
                  <div key={tag} className="bg-muted/30 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tag}</p>
                    {id && orderDetails[id] ? (
                      <OrderCard order={orderDetails[id]} tag={tag} />
                    ) : (
                      <p className="text-xs text-muted-foreground">{id ? `ID: ${id.slice(0, 8)}…` : '暂无数据'}</p>
                    )}
                  </div>
                ))}
              </div>

              {detailSplit?.note && (
                <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">{detailSplit.note}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailSplit(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderCard({ order, tag }: { order: OrderDetail; tag: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-mono text-muted-foreground">{order.order_no}</p>
      <p className="text-sm font-bold text-foreground">¥{Number(order.amount).toLocaleString()}</p>
      <Badge variant="outline" className="text-[11px]">{order.status}</Badge>
    </div>
  );
}
