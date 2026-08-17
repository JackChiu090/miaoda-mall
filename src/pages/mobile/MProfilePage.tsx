import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  ChevronRight, Shield, Wallet, Users, Bell, FileText,
  MapPin, LogOut, Star, Copy, QrCode, UserCircle, Settings,
  SwitchCamera, Lock, CheckCircle, Clock, XCircle, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { PullToRefreshIndicator } from '@/components/mobile/PullToRefreshIndicator';

const KYC_CONFIG = {
  approved: {
    label: '已认证',
    variant: 'default' as const,
    icon: CheckCircle,
    iconColor: 'text-success',
    desc: '您的身份已通过实名认证',
    cardBg: 'bg-success/5 border-success/20',
    btnLabel: '查看认证信息',
  },
  pending: {
    label: '审核中',
    variant: 'secondary' as const,
    icon: Clock,
    iconColor: 'text-warning',
    desc: '认证材料审核中，请耐心等待',
    cardBg: 'bg-warning/5 border-warning/20',
    btnLabel: '查看进度',
  },
  rejected: {
    label: '未通过',
    variant: 'destructive' as const,
    icon: XCircle,
    iconColor: 'text-destructive',
    desc: '认证审核未通过，请重新提交',
    cardBg: 'bg-destructive/5 border-destructive/20',
    btnLabel: '重新认证',
  },
  unsubmitted: {
    label: '未认证',
    variant: 'outline' as const,
    icon: AlertCircle,
    iconColor: 'text-muted-foreground',
    desc: '完成实名认证后可享受更多权益',
    cardBg: 'bg-muted/40 border-border',
    btnLabel: '立即认证',
  },
};

const LEVEL_LABELS: Record<string, string> = {
  normal: '普通用户',
  member: '会员',
  captain: '团长',
};

/** 设置Sheet中增加6个协议链接 */
const AGREEMENT_ITEMS = [
  { code: 'register_agreement', label: '注册协议' },
  { code: 'privacy_policy',     label: '隐私协议' },
  { code: 'user_notice',        label: '用户须知' },
  { code: 'c2c_payment_risk',   label: 'C2C个人支付风险须知' },
  { code: 'entrust_service',    label: '委托服务协议' },
  { code: 'sign_agreement',     label: '签约协议' },
];

export default function MProfilePage() {
  const { mobileUser, logout, refreshUser } = useMobileUser();
  const navigate = useNavigate();
  const [todayOrders, setTodayOrders] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!mobileUser) return;
    await refreshUser();
    const { count } = await supabase.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', mobileUser.id)
      .gte('created_at', new Date().toISOString().split('T')[0]);
    setTodayOrders(count ?? 0);
  }, [mobileUser, refreshUser]);

  useEffect(() => { loadData(); }, [mobileUser?.id]);

  const { pullDistance, isRefreshing } = usePullToRefresh(loadData);

  const handleLogout = () => {
    logout();
    setSettingsOpen(false);
    navigate('/m/login');
  };

  // 切换账号：退出当前登录 → 跳到登录页（保留已有账号记忆由用户重新输入）
  const handleSwitchAccount = () => {
    logout();
    setSettingsOpen(false);
    navigate('/m/login');
    toast.info('请使用新账号登录');
  };

  const copyInviteCode = () => {
    if (mobileUser?.invite_code) {
      navigator.clipboard.writeText(mobileUser.invite_code).then(() => toast.success('邀请码已复制'));
    }
  };

  if (!mobileUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="text-muted-foreground">请先登录</p>
        <Button onClick={() => navigate('/m/login')} className="w-full max-w-xs">去登录</Button>
      </div>
    );
  }

  const kycInfo = KYC_CONFIG[mobileUser.kyc_status] ?? KYC_CONFIG.unsubmitted;
  const KycIcon = kycInfo.icon;

  const menuGroups = [
    {
      items: [
        { icon: UserCircle, label: '会员中心', path: '/m/member', badge: undefined },
        { icon: Wallet, label: '我的钱包', path: '/m/wallet' },
        { icon: Users, label: '我的团队', path: '/m/team' },
      ],
    },
    {
      items: [
        { icon: MapPin, label: '收货地址', path: '/m/address' },
        { icon: Bell, label: '消息通知', path: '/m/notices' },
        { icon: FileText, label: '平台协议', path: '/m/agreement' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      {/* 头部 */}
      <div className="bg-card border-b border-border px-4 pt-8 pb-6">
        <div className="flex items-center gap-4">
          <Avatar className="w-16 h-16 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
              {mobileUser.nickname?.[0] ?? '用'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-foreground truncate">{mobileUser.kyc_status === 'approved' && mobileUser.real_name ? mobileUser.real_name : mobileUser.nickname}</p>
            {/* 手机号不对外展示 */}
            <div className="flex items-center gap-2 mt-1">
              {mobileUser.kyc_status !== 'approved' && (
                <Badge variant={kycInfo.variant} className="text-xs px-1.5 py-0">{kycInfo.label}</Badge>
              )}
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                <Star size={10} className="mr-0.5" />
                {LEVEL_LABELS[mobileUser.member_level]}
              </Badge>
            </div>
          </div>
          {/* 设置按钮 */}
          <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
            <SheetTrigger asChild>
              <button className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <Settings size={20} />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-w-[calc(100%-2rem)] mx-auto rounded-t-2xl pb-8">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-base">设置</SheetTitle>
              </SheetHeader>
              <div className="space-y-1 mb-3">
                <p className="text-xs font-medium text-muted-foreground px-1">平台协议</p>
                {AGREEMENT_ITEMS.map(ag => (
                  <button
                    key={ag.code}
                    onClick={() => { setSettingsOpen(false); navigate(`/m/agreement?tab=${ag.code}`); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-muted/40 rounded-xl text-sm text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <FileText size={16} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{ag.label}</span>
                    <ChevronRight size={15} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground px-1">账号操作</p>
                <button
                  onClick={handleSwitchAccount}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-muted/40 rounded-xl text-sm text-foreground hover:bg-muted/60 transition-colors"
                >
                  <SwitchCamera size={18} className="text-primary shrink-0" />
                  <span className="flex-1 text-left">切换账号</span>
                  <ChevronRight size={16} className="text-muted-foreground" />
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-destructive/10 rounded-xl text-sm text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <LogOut size={18} className="shrink-0" />
                  <span className="flex-1 text-left">退出登录</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* 邀请码 */}
        <div className="mt-4 bg-muted/40 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">我的邀请码</p>
            <p className="text-lg font-bold text-primary tracking-widest mt-0.5">{mobileUser.invite_code}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyInviteCode} className="text-muted-foreground hover:text-primary p-1">
              <Copy size={18} />
            </button>
            <button onClick={() => navigate('/m/invite')} className="text-muted-foreground hover:text-primary p-1">
              <QrCode size={18} />
            </button>
          </div>
        </div>

        {/* 今日进货数 */}
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <span>今日已进货</span>
          <span className="text-primary font-bold">{todayOrders}</span>
          <span>单</span>
        </div>
      </div>

      {/* 菜单列表 */}
      <div className="px-4 py-4 space-y-4">
        {menuGroups.map((group, gi) => (
          <div key={gi} className="bg-card rounded-xl border border-border overflow-hidden">
            {group.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <Icon size={18} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm text-foreground">{item.label}</span>
                  {item.badge && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0 mr-1">{item.badge}</Badge>
                  )}
                  <ChevronRight size={16} className="text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        ))}

        {/* ── 实名认证模块 ── */}
        <div className={`rounded-xl border p-4 ${kycInfo.cardBg}`}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center shrink-0">
              <KycIcon size={20} className={kycInfo.iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">实名认证</p>
                <Badge variant={kycInfo.variant} className="text-xs px-1.5 py-0 h-4">{kycInfo.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{kycInfo.desc}</p>
            </div>
          </div>
          {/* 未认证/审核未通过时才显示按钮 */}
          {mobileUser.kyc_status !== 'approved' && (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="default"
                className="h-8 px-4 text-xs gap-1.5"
                onClick={() => navigate('/m/auth')}
              >
                <Shield size={13} />
                {kycInfo.btnLabel}
                <ChevronRight size={12} />
              </Button>
            </div>
          )}
        </div>

        {/* ── 安全管理模块 ── */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Lock size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">安全管理</p>
              <p className="text-xs text-muted-foreground mt-0.5">保护您的账号安全</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/m/security')}
            className="w-full flex items-center gap-3 px-3 py-2.5 bg-muted/40 rounded-lg hover:bg-muted/60 active:bg-muted/80 transition-colors"
          >
            <Lock size={15} className="text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm text-foreground text-left">修改登录密码</span>
            <ChevronRight size={15} className="text-muted-foreground shrink-0" />
          </button>
        </div>

        <Button
          variant="ghost"
          className="w-full border border-muted text-muted-foreground hover:bg-muted/40 h-12"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={16} className="mr-2" />
          设置
        </Button>
      </div>
    </div>
  );
}
