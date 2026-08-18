// 会员中心首页
import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Copy, QrCode, ChevronRight,
  Clock, CreditCard, PackageCheck, CheckCircle2,
  ClipboardList, UserCircle,
  LayoutGrid, MapPin, Share2, Coins, BarChart2,
  ShoppingBag, Package, Shield,
  CheckCircle, AlertCircle, XCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import BottomTabBar from '@/components/mobile/BottomTabBar';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { PullToRefreshIndicator } from '@/components/mobile/PullToRefreshIndicator';

// KYC 状态配置
const KYC_CONFIG = {
  approved: { label: '已认证', variant: 'default' as const, icon: CheckCircle, iconColor: 'text-success', desc: '身份已认证', cardClass: 'bg-success/5 border-success/20' },
  pending:  { label: '审核中', variant: 'secondary' as const, icon: Clock,        iconColor: 'text-warning',     desc: '审核中，请等待', cardClass: 'bg-warning/5 border-warning/20' },
  rejected: { label: '未通过', variant: 'destructive' as const, icon: XCircle,   iconColor: 'text-destructive',  desc: '认证未通过，请重新提交', cardClass: 'bg-destructive/5 border-destructive/20' },
  unsubmitted: { label: '未认证', variant: 'outline' as const, icon: AlertCircle, iconColor: 'text-muted-foreground', desc: '完成认证享受更多权益', cardClass: 'bg-muted/40 border-border' },
};

interface AccountSummary { account_type: string; balance: number; }

// 今日收益查询：account_transactions 中今日入账汇总
async function fetchTodayIncome(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from('account_transactions')
    .select('amount')
    .eq('user_id', userId)
    .gte('created_at', today.toISOString())
    .gt('amount', 0);
  return (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
}

// 买方订单状态（key 与 MBuyWarehousePage TABS 保持一致）
const BUYER_STATUSES = [
  { key: 'pending_payment',  label: '待付款', icon: Clock },
  { key: 'payment_uploaded', label: '待确认', icon: CreditCard },
  { key: 'confirmed',        label: '已入库', icon: PackageCheck },
  { key: 'done',             label: '已完成', icon: CheckCircle2 },  // 对应 buy-warehouse tab=done
];

// 卖方订单状态（seller_id = 当前用户）
const SELLER_STATUSES = [
  { key: 'consign_active',   label: '寄卖中', icon: Package },        // 跳 sell-warehouse?tab=consign_active
  { key: 'pending_payment',  label: '待付款', icon: Clock },
  { key: 'payment_uploaded', label: '待确认', icon: CreditCard },
  { key: 'completed',        label: '已完成', icon: CheckCircle2 },
];

const BASE_MENU_GROUPS = [
  {
    items: [
      { icon: Shield,    label: '实名认证', path: '/m/auth',        color: 'text-primary' },
    ],
  },
  {
    items: [
      { icon: LayoutGrid, label: '签约中心', path: '/m/agreement', color: 'text-purple-500' },
      { icon: MapPin,     label: '我的地址', path: '/m/address',   color: 'text-violet-500' },
    ],
  },
  {
    items: [
      { icon: Share2,    label: '分销中心', path: '/m/team',     color: 'text-blue-500' },
      { icon: QrCode,    label: '二维码',   path: '/m/invite',   color: 'text-green-500' },
    ],
  },
];

// 仅团长可见的菜单组
const CAPTAIN_MENU_GROUP = {
  items: [
    { icon: BarChart2, label: '数据管理', path: '/m/orders', color: 'text-orange-400' },
  ],
};

export default function MMemberPage() {
  const { mobileUser, logout, refreshUser } = useMobileUser();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [buyerCounts, setBuyerCounts] = useState<Record<string, number>>({});
  const [sellerCounts, setSellerCounts] = useState<Record<string, number>>({});
  const [todayIncome, setTodayIncome] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (userId: string) => {
    const results = await Promise.all([
      supabase.from('user_accounts').select('account_type,balance').eq('user_id', userId),
      // 买方各状态订单数（done = resell_listed + completed）
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', userId).eq('status', 'pending_payment'),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', userId).eq('status', 'payment_uploaded'),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', userId).eq('status', 'confirmed'),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('buyer_id', userId).in('status', ['resell_listed', 'completed']),
      // 卖方各状态：寄卖中查 products（approved+is_active），其余查 orders
      supabase.from('products').select('id', { count: 'exact', head: true })
        .eq('seller_id', userId).eq('status', 'approved').eq('is_active', true),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('seller_id', userId).eq('status', 'pending_payment'),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('seller_id', userId).eq('status', 'payment_uploaded'),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('seller_id', userId).eq('status', 'completed'),
      fetchTodayIncome(userId),
    ]);

    const [accs, ...rest] = results;
    const buyerSlice = rest.slice(0, BUYER_STATUSES.length) as { count: number | null }[];
    const sellerSlice = rest.slice(BUYER_STATUSES.length, BUYER_STATUSES.length + SELLER_STATUSES.length) as { count: number | null }[];
    const todayAmt = rest[BUYER_STATUSES.length + SELLER_STATUSES.length] as number;

    setAccounts((accs.data as AccountSummary[]) ?? []);
    const bc: Record<string, number> = {};
    BUYER_STATUSES.forEach((s, i) => { bc[s.key] = buyerSlice[i].count ?? 0; });
    setBuyerCounts(bc);
    const sc: Record<string, number> = {};
    SELLER_STATUSES.forEach((s, i) => { sc[s.key] = sellerSlice[i].count ?? 0; });
    setSellerCounts(sc);
    setTodayIncome(todayAmt);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!mobileUser) { setLoading(false); return; }
    loadData(mobileUser.id);
  }, [mobileUser?.id]);

  const handleRefresh = useCallback(async () => {
    if (!mobileUser) return;
    setRefreshing(true);
    await loadData(mobileUser.id);
    setRefreshing(false);
    toast.success('已刷新');
  }, [mobileUser, loadData]);

  const { pullDistance, isRefreshing: pullRefreshing } = usePullToRefresh(handleRefresh);

  const handleLogout = () => { logout(); navigate('/m/login'); };

  const copyInvite = () => {
    if (mobileUser?.invite_code)
      navigator.clipboard.writeText(mobileUser.invite_code).then(() => toast.success('邀请码已复制'));
  };

  if (!mobileUser) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6">
      <p className="text-sm text-muted-foreground">请先登录以查看会员中心</p>
      <Button onClick={() => navigate('/m/login')} className="w-full max-w-xs">立即登录</Button>
    </div>
  );

  const acc = (type: string) => accounts.find(a => a.account_type === type)?.balance ?? 0;
  const kycCfg = KYC_CONFIG[mobileUser.kyc_status] ?? KYC_CONFIG.unsubmitted;
  const KycIcon = kycCfg.icon;
  const isCaptain = mobileUser.member_level === 'captain';
  const menuGroups = isCaptain ? [...BASE_MENU_GROUPS, CAPTAIN_MENU_GROUP] : BASE_MENU_GROUPS;

  return (
    <>
      <div className="min-h-screen bg-muted/30 pb-20">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={pullRefreshing} />
        {/* ── 顶部用户信息（主色背景） ── */}
        <div className="bg-primary px-5 pt-10 pb-6 relative">
          {/* 刷新按钮 */}
          <button
            onClick={handleRefresh}
            disabled={refreshing || pullRefreshing}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 active:bg-white/30 transition-colors"
            aria-label="刷新"
          >
            <RefreshCw size={16} className={`text-white ${(refreshing || pullRefreshing) ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <UserCircle size={36} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xl font-bold leading-tight truncate">
                {mobileUser.kyc_status === 'approved' && mobileUser.real_name
                  ? mobileUser.real_name
                  : (mobileUser.nickname ?? '用户')}
              </p>
              {/* 手机号不对外展示 */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <p className="text-white/70 text-xs">邀请码：{mobileUser.invite_code}</p>
                <button onClick={copyInvite} className="active:opacity-60">
                  <Copy size={12} className="text-white/70" />
                </button>
                {/* 已认证时不显示认证状态badge */}
                {mobileUser.kyc_status !== 'approved' && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-white/90 text-[10px] font-medium flex items-center gap-0.5">
                    <Shield size={9} />
                    {kycCfg.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 -mt-1 space-y-3">

          {/* ── 实名认证状态横幅 ── */}
          <Link
            to="/m/auth"
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${kycCfg.cardClass}`}
          >
            <div className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center shrink-0">
              <KycIcon size={18} className={kycCfg.iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">实名认证</span>
                <Badge variant={kycCfg.variant} className="text-[10px] px-1.5 py-0 h-4">{kycCfg.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{kycCfg.desc}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground shrink-0" />
          </Link>

          {/* ── 买方订单 ── */}
          <div className="bg-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-semibold text-foreground">买方</span>
              <Link to="/m/buy-warehouse" className="text-xs text-muted-foreground flex items-center gap-0.5">
                买单仓库 <ChevronRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-1 px-2 pb-4">
              {BUYER_STATUSES.map(s => {
                const Icon = s.icon;
                const cnt = buyerCounts[s.key] ?? 0;
                return (
                  <Link key={s.key} to={`/m/buy-warehouse?tab=${s.key}`}
                    className="flex flex-col items-center gap-1.5 py-2 active:bg-muted/30 rounded-xl relative">
                    <div className="relative">
                      <Icon size={24} className="text-primary" strokeWidth={1.5} />
                      {cnt > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                          {cnt > 99 ? '99+' : cnt}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ── 卖方订单 ── */}
          <div className="bg-card rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-semibold text-foreground">卖方</span>
              <Link to="/m/sell-warehouse" className="text-xs text-muted-foreground flex items-center gap-0.5">
                卖单仓库 <ChevronRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-1 px-2 pb-4">
              {SELLER_STATUSES.map(s => {
                const Icon = s.icon;
                const cnt = sellerCounts[s.key] ?? 0;
                return (
                  <Link key={`sell-${s.key}`}
                    to={s.key === 'consign_active'
                      ? '/m/sell-warehouse?tab=consign_active'
                      : `/m/sell-warehouse?tab=${s.key}`}
                    className="flex flex-col items-center gap-1.5 py-2 active:bg-muted/30 rounded-xl relative">
                    <div className="relative">
                      <Icon size={24} className="text-orange-500" strokeWidth={1.5} />
                      {cnt > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                          {cnt > 99 ? '99+' : cnt}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ── 2×2 资金卡片 ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* 兑换代金券 */}
            <Link to="/m/wallet-detail?type=points"
              className="rounded-2xl p-4 min-h-[90px] flex flex-col justify-between relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #fef9e7 0%, #fdf3c8 100%)' }}>
              <div>
                {loading ? <Skeleton className="h-7 w-20 bg-yellow-200" /> : (
                  <p className="text-2xl font-bold text-yellow-700">{acc('points').toFixed(2)}</p>
                )}
                <p className="text-xs text-yellow-600 mt-0.5">元 代金券储备</p>
                <p className="text-[10px] text-yellow-500 mt-0.5">订单0.3%自动存入</p>
              </div>
              <div className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-yellow-300/60 flex items-center justify-center">
                <Coins size={16} className="text-yellow-600" />
              </div>
            </Link>
            {/* 优惠券 */}
            <Link to="/m/wallet-detail?type=coupon"
              className="rounded-2xl p-4 min-h-[90px] flex flex-col justify-between relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' }}>
              <div>
                {loading ? <Skeleton className="h-7 w-20 bg-blue-200" /> : (
                  <p className="text-2xl font-bold text-blue-700">{acc('coupon').toFixed(2)}</p>
                )}
                <p className="text-xs text-blue-600 mt-0.5">元 优惠券</p>
              </div>
              <div className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-blue-300/60 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-600">
                  <rect x="2" y="6" width="20" height="12" rx="2"/><path d="M16 6v12M8 6v12"/>
                </svg>
              </div>
            </Link>
            {/* 我的奖金 */}
            <Link to="/m/wallet-detail?type=bonus"
              className="rounded-2xl p-4 min-h-[90px] flex flex-col justify-between relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #fef9e7 0%, #fdf3c8 100%)' }}>
              <div>
                {loading ? <Skeleton className="h-7 w-20 bg-yellow-200" /> : (
                  <p className="text-2xl font-bold text-yellow-700">{acc('bonus').toFixed(2)}</p>
                )}
                <p className="text-xs text-yellow-600 mt-0.5">元 我的奖金</p>
              </div>
              <div className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-yellow-300/60 flex items-center justify-center">
                <Coins size={16} className="text-yellow-600" />
              </div>
            </Link>
            {/* 推广奖金 */}
            <Link to="/m/commissions"
              className="rounded-2xl p-4 min-h-[90px] flex flex-col justify-between relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' }}>
              <div>
                {loading ? <Skeleton className="h-7 w-20 bg-blue-200" /> : (
                  <p className="text-2xl font-bold text-blue-700">{acc('promotion').toFixed(2)}</p>
                )}
                <p className="text-xs text-blue-600 mt-0.5">元 推广佣金</p>
              </div>
              <div className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-blue-300/60 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-600">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
            </Link>
          </div>

          {/* ── 功能菜单组 ── */}
          {menuGroups.map((group, gi) => (
            <div key={gi} className="bg-card rounded-2xl overflow-hidden">
              {group.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path}
                    className={`flex items-center gap-3 px-4 py-4 active:bg-muted/30 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <div className={`w-7 h-7 flex items-center justify-center`}>
                      <Icon size={20} className={item.color} />
                    </div>
                    <span className="flex-1 text-sm text-foreground">{item.label}</span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          ))}

          {/* ── 退出登录 ── */}
          <Button variant="ghost"
            className="w-full border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 h-11 rounded-2xl"
            onClick={handleLogout}>
            退出登录
          </Button>

        </div>
      </div>
      <BottomTabBar />
    </>
  );
}
