import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { CommissionRecord } from '@/types/types';

const PAGE_SIZE = 20;

const COMMISSION_TYPE_LABEL: Record<string, { label: string; rate: string; color: string }> = {
  merchant_bonus:  { label: '商家分红',   rate: '1%',   color: 'text-primary' },
  boss_bonus:      { label: '老板分红',   rate: '1.5%', color: 'text-accent' },
  captain_direct:  { label: '直接奖励',   rate: '0.2%', color: 'text-success' },
  voucher_reserve: { label: '代金券储备', rate: '0.3%', color: 'text-warning' },
};

export default function CommissionsPage() {
  const [items, setItems] = useState<CommissionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  async function fetchItems() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    let q = supabase.from('commission_records')
      .select('*, recipient:recipient_id(phone,nickname)', { count: 'exact' });
    if (typeFilter !== 'all') q = q.eq('commission_type', typeFilter);
    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    setLoading(false);
    if (error) { toast.error('加载失败'); return; }
    setItems(Array.isArray(data) ? data : []);
    setTotal(count ?? 0);
  }

  useEffect(() => { fetchItems(); }, [page, typeFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 汇总统计
  const [summary, setSummary] = useState<Record<string, number>>({});
  useEffect(() => {
    supabase.from('commission_records').select('commission_type, amount').eq('status', 'settled').then(({ data }) => {
      const s: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        s[r.commission_type] = (s[r.commission_type] ?? 0) + Number(r.amount);
      });
      setSummary(s);
    });
  }, []);

  return (
    <AdminLayout>
      <PageHeader title="分销奖金结算记录" description={`共 ${total} 条`} />

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {Object.entries(COMMISSION_TYPE_LABEL).map(([key, cfg]) => (
          <div key={key} className="bg-card border border-border rounded-sm p-3">
            <p className="text-xs text-muted-foreground mb-1">{cfg.label}<span className="ml-1 text-xs text-muted-foreground/60">({cfg.rate})</span></p>
            <p className={`text-base font-medium font-mono ${cfg.color}`}>
              ¥{(summary[key] ?? 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* 类型筛选 */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {[{ value: 'all', label: '全部' }, ...Object.entries(COMMISSION_TYPE_LABEL).map(([k, v]) => ({ value: k, label: v.label }))].map(t => (
          <button key={t.value} onClick={() => { setTypeFilter(t.value); setPage(1); }}
            className={`text-xs px-2.5 py-1 rounded-sm border transition-colors ${
              typeFilter === t.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['分润类型', '收款人', '订单金额', '费率', '结算金额', '状态', '结算时间'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">暂无结算记录</td></tr>
            ) : items.map((item, i) => {
              const cfg = COMMISSION_TYPE_LABEL[item.commission_type];
              return (
                <tr key={item.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`text-xs font-medium ${cfg?.color ?? 'text-foreground'}`}>{cfg?.label ?? item.commission_type}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    <p className="font-mono">{(item.recipient as any)?.phone ?? '-'}</p>
                    <p className="text-muted-foreground">{(item.recipient as any)?.nickname ?? ''}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">
                    ¥{Number(item.order_amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {(Number(item.rate) * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono font-medium text-primary">
                    ¥{Number(item.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={item.status} /></td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {new Date(item.settled_at || item.created_at).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              );
            })}
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
