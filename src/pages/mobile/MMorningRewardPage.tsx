// 早市激励奖励明细：展示当前用户作为获奖上级收到的早市激励奖励流水
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';

interface RewardRecord {
  id: string;
  order_id: string;
  buyer_id: string;
  reward_amount: number;
  recipient_level: number;
  reward_rate: number;
  created_at: string;
  buyer?: { phone: string; nickname?: string; real_name?: string } | null;
}

const PAGE_SIZE = 20;

export default function MMorningRewardPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [records, setRecords] = useState<RewardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p: number) => {
    if (!mobileUser) return;
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from('morning_reward_records')
      .select('id, order_id, buyer_id, reward_amount, recipient_level, reward_rate, created_at, buyer:users!morning_reward_records_buyer_id_fkey(phone,nickname,real_name)', { count: 'exact' })
      .eq('recipient_id', mobileUser.id)
      .order('created_at', { ascending: false })
      .range(from, to);
    setRecords((data as unknown as RewardRecord[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [mobileUser]);

  useEffect(() => { load(page); }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalAmount = records.reduce((s, r) => s + Number(r.reward_amount), 0);
  const displayName = (u?: { phone: string; nickname?: string; real_name?: string } | null) =>
    u ? (u.real_name || u.nickname || u.phone) : '—';

  return (
    <div className="min-h-screen bg-background pb-6">
      <MobileHeader title="早市激励奖励" back />

      {/* 汇总卡片 */}
      <div className="mx-4 mt-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={16} className="text-primary" />
          <span className="text-xs text-muted-foreground">早市激励奖励（本页）</span>
        </div>
        <p className="text-2xl font-bold text-primary">¥{totalAmount.toFixed(2)}</p>
        <p className="text-[11px] text-muted-foreground mt-1">下级商家完成抢购订单后，系统按推荐链路自动分配的奖励</p>
      </div>

      <div className="px-4 mt-4">
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Trophy size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无早市激励奖励</p>
            <p className="text-xs mt-1">下级商家完成抢购订单后，奖励将在此展示</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(r => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <TrendingUp size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground truncate">来自 {displayName(r.buyer)}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">第{r.recipient_level}级</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    · 比例 {(Number(r.reward_rate) * 100).toFixed(2)}%
                  </p>
                </div>
                <span className="text-primary font-bold text-sm shrink-0">+¥{Number(r.reward_amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">共 {total} 条</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}