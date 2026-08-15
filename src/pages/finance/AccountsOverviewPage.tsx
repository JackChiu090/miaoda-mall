import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Wallet, TrendingUp, Star, Tag, CircleDollarSign } from 'lucide-react';

const ACCOUNT_TYPES = [
  { key: 'bonus', label: '奖金账户', icon: Star, color: 'text-primary' },
  { key: 'points', label: '代金券账户', icon: CircleDollarSign, color: 'text-success' },
  { key: 'coupon', label: '优惠券账户', icon: Tag, color: 'text-warning' },
  { key: 'promotion', label: '推广奖金账户', icon: TrendingUp, color: 'text-info' },
];

export default function AccountsOverviewPage() {
  const [stats, setStats] = useState<Record<string, { total_balance: number; user_count: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      const { data } = await supabase.from('virtual_accounts').select('account_type, balance');
      if (!data) { setLoading(false); return; }
      const map: Record<string, { total_balance: number; user_count: number }> = {};
      data.forEach((row: any) => {
        if (!map[row.account_type]) map[row.account_type] = { total_balance: 0, user_count: 0 };
        map[row.account_type].total_balance += Number(row.balance);
        map[row.account_type].user_count += 1;
      });
      setStats(map);
      setLoading(false);
    }
    fetchStats();
  }, []);

  return (
    <AdminLayout>
      <PageHeader title="账户总览" description="平台五类虚拟账户汇总统计" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ACCOUNT_TYPES.map(at => {
          const s = stats[at.key] ?? { total_balance: 0, user_count: 0 };
          const Icon = at.icon;
          return (
            <div key={at.key} className="bg-card border border-border rounded-sm p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{at.label}</p>
                  <p className={`kpi-number text-2xl font-medium ${at.color}`}>
                    {loading ? '-' : `¥${s.total_balance.toFixed(2)}`}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-sm bg-muted flex items-center justify-center shrink-0">
                  <Icon size={16} className={at.color} />
                </div>
              </div>
              <div className="pt-3 border-t border-border text-xs text-muted-foreground">
                持有账户用户：<span className="text-foreground font-medium">{loading ? '-' : s.user_count}</span> 人
              </div>
            </div>
          );
        })}

        {/* 总计卡已移除 */}
      </div>

      {/* 账户流转说明（更新规则） */}
      <div className="mt-6 bg-card border border-border rounded-sm p-4">
        <h3 className="text-sm font-medium mb-3">账户流转规则</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-sm shrink-0" />
              <span><span className="text-foreground font-medium">奖金账户</span> → 不可转入其他账户，不可提现</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-success rounded-sm shrink-0" />
              <span><span className="text-foreground font-medium">代金券账户</span> → 不可提现，仅消费抵扣</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-warning rounded-sm shrink-0" />
              <span><span className="text-foreground font-medium">优惠券账户</span> → 仅消费抵扣，无有效期，不可提现</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-info rounded-sm shrink-0" />
              <span><span className="text-foreground font-medium">推广奖金账户</span> → 独立核算，不可提现</span>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
