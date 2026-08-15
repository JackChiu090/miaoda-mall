import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { AccountTransaction } from '@/types/types';

const PAGE_SIZE = 20;

export default function PromotionRecordsPage() {
  const [items, setItems] = useState<AccountTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await supabase
      .from('account_transactions')
      .select('*, user:user_id(phone,nickname)', { count: 'exact' })
      .eq('account_type', 'promotion')
      .eq('type', 'in')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
  }

  useEffect(() => {
    fetchItems();
    supabase.from('account_transactions')
      .select('amount')
      .eq('account_type', 'promotion')
      .eq('type', 'in')
      .then(({ data }) => {
        setTotalAmount((data ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0));
      });
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="推广奖金发放记录" description={`共 ${total} 条，累计发放 ¥${totalAmount.toFixed(2)}`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="bg-card border border-border rounded-sm p-4">
          <p className="text-xs text-muted-foreground mb-1">推广奖金累计发放</p>
          <p className="text-2xl font-medium text-primary font-mono kpi-number">¥{totalAmount.toFixed(2)}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-4">
          <p className="text-xs text-muted-foreground mb-1">发放笔数</p>
          <p className="text-2xl font-medium text-foreground font-mono kpi-number">{total}</p>
        </div>
        <div className="bg-card border border-border rounded-sm p-4">
          <p className="text-xs text-muted-foreground mb-1">账户类型说明</p>
          <p className="text-xs text-muted-foreground mt-1">推广奖金账户独立核算，可直接提现至绑定银行卡/支付宝</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['收款人', '金额', '余额（发放后）', '说明', '发放时间'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">暂无推广奖金记录</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <p className="font-mono">{(item as any).user?.phone ?? '-'}</p>
                  <p className="text-muted-foreground">{(item as any).user?.nickname ?? ''}</p>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono font-medium text-success">
                  +¥{Number(item.amount).toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                  ¥{Number(item.balance_after).toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap max-w-48 truncate">{item.description}</td>
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
