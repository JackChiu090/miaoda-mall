import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, TrendingUp, ArrowDownLeft, Gift, Coins, ChevronRight, Trophy } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';

interface AccountSummary { account_type: string; balance: number; frozen_balance: number; total_in: number; }

const ACCOUNT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; desc: string }> = {
  bonus: { label: '分红账户', icon: TrendingUp, color: 'text-success', desc: '团队分润收益' },
  points: { label: '代金券账户', icon: Coins, color: 'text-warning', desc: '平台代金券' },
  coupon: { label: '优惠券账户', icon: Gift, color: 'text-accent', desc: '折扣优惠权益' },
  promotion: { label: '推广账户', icon: TrendingUp, color: 'text-info', desc: '推广奖励收益' },
};

export default function MWalletPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mobileUser) { setLoading(false); return; }
    supabase.from('user_accounts')
      .select('account_type,balance,frozen_balance,total_in')
      .eq('user_id', mobileUser.id)
      .then(({ data }) => { setAccounts(data ?? []); setLoading(false); });
  }, [mobileUser?.id]);

  if (!mobileUser) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Button onClick={() => navigate('/m/login')}>请先登录</Button>
    </div>
  );

  const totalBalance = accounts.filter(a => ['bonus', 'promotion'].includes(a.account_type))
    .reduce((sum, a) => sum + a.balance, 0);

  // 历史总收益：所有收益类账户的 total_in 累计
  const totalIncome = accounts.filter(a => ['bonus', 'promotion'].includes(a.account_type))
    .reduce((sum, a) => sum + (a.total_in ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* 头部总览 */}
      <div className="bg-primary px-4 pt-4 pb-8">
        <MobileHeader title="我的钱包" back transparent className="text-white" />
        <p className="text-primary-foreground/80 text-sm mb-1">当前余额</p>
        {loading ? (
          <Skeleton className="h-10 w-40 bg-white/20" />
        ) : (
          <p className="text-white text-3xl font-bold">¥{totalBalance.toFixed(2)}</p>
        )}
        <p className="text-primary-foreground/60 text-xs mt-1">余额 + 分红 + 推广</p>

        {/* 总收益展示 */}
        <div className="mt-3 bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-primary-foreground/70 text-xs">累计总收益</p>
            {loading ? (
              <Skeleton className="h-6 w-28 bg-white/20 mt-1" />
            ) : (
              <p className="text-yellow-300 text-xl font-black">¥{totalIncome.toFixed(2)}</p>
            )}
          </div>
          <TrendingUp size={28} className="text-white/30" />
        </div>

        {/* 快捷操作 */}
        <div className="flex gap-3 mt-3">
          <Link to="/m/exchange" className="flex-1 bg-white/10 rounded-xl py-3 flex flex-col items-center gap-1 hover:bg-white/20">
            <Gift size={20} className="text-white" />
            <span className="text-white text-xs">代金券兑换</span>
          </Link>
          <Link to="/m/wallet-detail" className="flex-1 bg-white/10 rounded-xl py-3 flex flex-col items-center gap-1 hover:bg-white/20">
            <ArrowDownLeft size={20} className="text-white" />
            <span className="text-white text-xs">明细</span>
          </Link>
        </div>
      </div>

      {/* 账户列表 */}
      <div className="px-4 py-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">账户详情</h2>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : (
          ['bonus', 'promotion', 'points', 'coupon'].map(type => {
            const acc = accounts.find(a => a.account_type === type);
            const cfg = ACCOUNT_CONFIG[type];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <Link
                key={type}
                to={`/m/wallet-detail?type=${type}`}
                className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3.5 hover:bg-muted/20"
              >
                <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0`}>
                  <Icon size={18} className={cfg.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">{cfg.desc}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">
                    {acc ? `¥${acc.balance.toFixed(2)}` : '¥0.00'}
                  </p>
                  {acc && acc.frozen_balance > 0 && (
                    <p className="text-xs text-muted-foreground">冻结 ¥{acc.frozen_balance.toFixed(2)}</p>
                  )}
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0 ml-1" />
              </Link>
            );
          })
        )}

        {/* 早市激励奖励入口 */}
        <Link
          to="/m/wallet/morning-reward"
          className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3.5 hover:bg-muted/20"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">早市激励奖励</p>
            <p className="text-xs text-muted-foreground">下级完成抢购订单后的分级奖励</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground shrink-0 ml-1" />
        </Link>

        {/* 绑卡入口 */}
        <Link
          to="/m/bind-card"
          className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3.5 hover:bg-muted/20"
        >
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Wallet size={18} className="text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">绑定银行卡</p>
            <p className="text-xs text-muted-foreground">绑定后可申请提现</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}
