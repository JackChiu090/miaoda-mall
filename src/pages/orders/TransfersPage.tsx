import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Gift, ArrowRightLeft } from 'lucide-react';
import type { TransferRecord } from '@/types/types';

const PAGE_SIZE = 20;

export default function TransfersPage() {
  const [items, setItems] = useState<TransferRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await supabase
      .from('transfer_records')
      .select('*, from_user:from_user_id(phone,nickname), to_user:to_user_id(phone,nickname), product:product_id(title)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
  }

  useEffect(() => { fetchItems(); }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="转拍/赠送记录" description={`共 ${total} 条`} />

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['类型', '商品', '转出方', '接收方', '原订单', '新订单', '时间'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">暂无记录</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 text-xs border px-2 py-0.5 rounded-sm ${
                    item.type === 'resell' ? 'border-accent/40 text-accent' : 'border-success/40 text-success'
                  }`}>
                    {item.type === 'resell' ? <><ArrowRightLeft size={10} />转拍</> : <><Gift size={10} />赠送</>}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap max-w-32 truncate">{(item.product as any)?.title ?? '-'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">{(item.from_user as any)?.phone ?? '-'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">{(item.to_user as any)?.phone ?? '-'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                  {item.from_order_id.slice(0, 8)}...
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                  {item.new_order_id ? `${item.new_order_id.slice(0, 8)}...` : '-'}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(item.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
          <span>共 {total} 条，第 {page}/{totalPages} 页</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="h-7 px-3 text-xs border border-border">上一页</Button>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="h-7 px-3 text-xs border border-border">下一页</Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
