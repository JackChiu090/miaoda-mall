import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CheckCircle, XCircle } from 'lucide-react';
import type { WithdrawalRequest } from '@/types/types';

const PAGE_SIZE = 20;
const ACCT_LABEL: Record<string, string> = { points: '代金券账户', promotion: '推广奖金账户' };

export default function WithdrawalsPage() {
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await supabase
      .from('withdrawal_requests')
      .select('*, user:user_id(phone,nickname)', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
  }

  useEffect(() => { fetchItems(); }, [page]);

  async function handleApprove(item: WithdrawalRequest) {
    const { error } = await supabase.from('withdrawal_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', item.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('已批准提现申请');
    fetchItems();
  }

  async function confirmReject() {
    if (!selected) return;
    const { error } = await supabase.from('withdrawal_requests')
      .update({ status: 'rejected', reject_reason: rejectReason || '不符合提现条件', reviewed_at: new Date().toISOString() })
      .eq('id', selected.id);
    if (error) { toast.error('操作失败'); return; }
    toast.success('已拒绝提现申请');
    setRejectOpen(false);
    fetchItems();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AdminLayout>
      <PageHeader title="提现审核" description={`待审核 ${total} 条`} />

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['用户', '账户类型', '提现金额', '收款方式', '收款账号', '申请时间', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">暂无待审核提现申请</td></tr>
            ) : items.map((item, i) => (
              <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <p className="font-mono">{(item.user as any)?.phone ?? '-'}</p>
                  <p className="text-muted-foreground">{(item.user as any)?.nickname ?? ''}</p>
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">{ACCT_LABEL[item.account_type] ?? item.account_type}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono font-medium text-primary">
                  ¥{Number(item.amount).toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">{item.bank_name ?? '-'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                  {item.bank_account ? `${item.bank_account.slice(0, 4)}****${item.bank_account.slice(-4)}` : '-'}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(item.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleApprove(item)}
                      className="h-6 px-2 text-xs border border-success/40 text-success hover:bg-success/10">
                      <CheckCircle size={11} className="mr-1" />批准
                    </Button>
                    <Button variant="ghost" size="sm"
                      onClick={() => { setSelected(item); setRejectReason(''); setRejectOpen(true); }}
                      className="h-6 px-2 text-xs border border-destructive/40 text-destructive hover:bg-destructive/10">
                      <XCircle size={11} className="mr-1" />拒绝
                    </Button>
                  </div>
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

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm bg-card border-border">
          <DialogHeader><DialogTitle className="text-sm">拒绝提现申请</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="拒绝原因（选填）" className="text-xs bg-muted border-border min-h-20 resize-none" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)} className="h-7 px-3 text-xs border border-border">取消</Button>
              <Button size="sm" onClick={confirmReject} className="h-7 px-3 text-xs bg-destructive text-white hover:bg-destructive/90 border-0">确认拒绝</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
