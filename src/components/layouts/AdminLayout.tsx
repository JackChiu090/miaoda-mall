import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canAccess, ROLE_LABELS } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard, Users, Package, ShoppingCart, Wallet,
  Share2, Settings, Menu, LogOut, ChevronDown, ChevronRight,
  Bell, FileText, Megaphone, BarChart3, Shield, Star,
  Tag, ClipboardList, Gift, TrendingUp, CircleDollarSign,
  UserCog, ShoppingBag, Images, Scissors, Users2,
  SlidersHorizontal, ClipboardCheck, SearchCode, PenTool, ShieldCheck, Zap, RefreshCw, Network, Trophy, Eraser,
} from 'lucide-react';

interface NavItem {
  label: string;
  // path 存在且无 children 时为顶级直达链接
  path?: string;
  icon: React.ElementType;
  children?: NavItem[];
  // 顶级直达项标记（无需展开/折叠）
  direct?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  // ── 1. 数据总览（直达）──
  {
    label: '数据仪表盘',
    path: '/dashboard',
    icon: BarChart3,
    direct: true,
  },
  // ── 2. 用户管理 ──
  {
    label: '用户管理',
    icon: Users,
    children: [
      { label: '用户列表', path: '/users', icon: Users },
      { label: '推荐关系图表', path: '/referral-graph', icon: Network },
      { label: '实名认证审核', path: '/kyc', icon: Shield },
      { label: '等级管理', path: '/member-levels', icon: Star },
    ],
  },
  // ── 3. 商品管理 ──
  {
    label: '商品管理',
    icon: Package,
    children: [
      { label: '寄卖审核', path: '/products', icon: Package },
      { label: '寄卖中', path: '/consign-on-sale', icon: ShoppingBag },
      { label: '寄卖商品管理', path: '/consign-manage', icon: ShoppingBag },
      { label: '甄选单品展示', path: '/featured-spotlight', icon: Star },
      { label: '商品分类', path: '/categories', icon: Tag },
    ],
  },
  // ── 4. 活动与进货 ──
  {
    label: '活动与进货',
    icon: Zap,
    children: [
      { label: '9:29早场资格管理', path: '/rush-list', icon: ClipboardCheck },
      { label: '进货商品管理', path: '/rush-products', icon: Package },
      { label: '进货时段管理', path: '/flash-buy-manage', icon: Zap },
      { label: '早市分级激励', path: '/morning-incentive', icon: Trophy },
      { label: '转拍时间设置', path: '/resell-config', icon: RefreshCw },
    ],
  },
  // ── 5. 订单管理 ──
  {
    label: '订单管理',
    icon: ShoppingCart,
    children: [
      { label: '订单列表', path: '/orders', icon: ClipboardList },
      { label: '订单列表（新版）', path: '/orders-v2', icon: ClipboardCheck },
      { label: '转拍/赠送记录', path: '/transfers', icon: Gift },
      { label: '拆单记录', path: '/order-split', icon: Scissors },
      { label: '子商城管理', path: '/team-split', icon: Users2 },
    ],
  },
  // ── 6. 资金与分销 ──
  {
    label: '资金与分销',
    icon: Wallet,
    children: [
      { label: '账户总览', path: '/accounts', icon: Wallet },
      { label: '账户明细', path: '/account-detail', icon: ClipboardList },
      { label: '代金券资金池', path: '/voucher-pool', icon: CircleDollarSign },
      { label: '代金券兑换商城', path: '/exchange-mall', icon: ShoppingBag },
      { label: '分销关系', path: '/distribution', icon: Share2 },
      { label: '推广奖金记录', path: '/promotion-records', icon: TrendingUp },
      { label: '奖金结算记录', path: '/commissions', icon: CircleDollarSign },
      { label: '团队数据统计', path: '/team-stats', icon: BarChart3 },
    ],
  },
  // ── 7. 考核与审计 ──
  {
    label: '考核与审计',
    icon: ClipboardCheck,
    children: [
      { label: '招商考核', path: '/merchant-assessment', icon: ClipboardCheck },
      { label: '体验商家列表', path: '/trial-merchants', icon: Users },
      { label: '交易凭证核查', path: '/voucher-review', icon: SearchCode },
      { label: '商品溯源查询', path: '/product-trace', icon: SearchCode },
    ],
  },
  // ── 8. 运营与系统 ──
  {
    label: '运营与系统',
    icon: Settings,
    children: [
      { label: 'Banner管理', path: '/banners', icon: Images },
      { label: '公告通知', path: '/announcements', icon: Megaphone },
      { label: '首页装修', path: '/homepage-decor', icon: LayoutDashboard },
      { label: '页面设计', path: '/page-designer', icon: PenTool },
      { label: '平台协议', path: '/agreements', icon: FileText },
      { label: '消息通知', path: '/notifications', icon: Bell },
      { label: '系统设置', path: '/settings', icon: Settings },
      { label: '系统配置', path: '/system-config', icon: SlidersHorizontal },
      { label: '管理员账号', path: '/admin-accounts', icon: UserCog },
      { label: '测试数据清除', path: '/clear-test-data', icon: Eraser },
    ],
  },
];

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const { signOut, adminProfile } = useAuth();
  const navigate = useNavigate();
  const role = adminProfile?.role ?? null;

  // 根据角色过滤后的导航项（过滤掉子菜单全无权限的分组）
  const visibleNavItems = NAV_ITEMS.map(group => {
    // 顶级直达项：按 path 权限单独过滤
    if (group.direct) {
      return canAccess(role, group.path ?? '') ? group : null;
    }
    return {
      ...group,
      children: group.children?.filter(item => canAccess(role, item.path ?? '')),
    };
  }).filter((g): g is NavItem => !!g && (g.direct ? true : (g.children?.length ?? 0) > 0));

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // 自动展开当前路径所在分组
  React.useEffect(() => {
    visibleNavItems.forEach(group => {
      if (group.children?.some(c => c.path === location.pathname || location.pathname.startsWith((c.path ?? '') + '/'))) {
        setExpandedGroups(prev => prev.includes(group.label) ? prev : [...prev, group.label]);
      }
    });
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* 品牌标识 */}
      <div className="flex items-center gap-2 px-4 h-14 border-sidebar-border shrink-0 border-[0px] border-solid border-[#160808]">
        <div className="w-7 h-7 bg-primary rounded-sm flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-sm leading-none">{"ZTC"}</span>
        </div>
        <span className="text-sidebar-foreground font-medium text-sm tracking-wide">{"众泰成商城管理后台"}</span>
      </div>
      {/* 导航区 */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {visibleNavItems.map(group => {
          const GroupIcon = group.icon;

          // ── 顶级直达链接（无折叠，直接渲染为 Link）──
          if (group.direct && group.path) {
            const isActive = location.pathname === group.path || location.pathname.startsWith(group.path + '/');
            return (
              <div key={group.label} className="mb-1">
                <Link
                  to={group.path}
                  onClick={onNavClick}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm transition-colors duration-150',
                    isActive
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary'
                  )}
                >
                  <GroupIcon size={15} className="shrink-0" />
                  <span className="flex-1">{group.label}</span>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground/80 shrink-0" />}
                </Link>
              </div>
            );
          }

          // ── 可折叠分组 ──
          const isExpanded = expandedGroups.includes(group.label);
          const hasActive = group.children?.some(c => c.path === location.pathname || location.pathname.startsWith((c.path ?? '') + '/'));

          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-sm text-sm transition-colors duration-150',
                  hasActive
                    ? 'text-primary bg-sidebar-accent'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary'
                )}
              >
                <GroupIcon size={15} className="shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>

              {isExpanded && group.children && (
                <div className="ml-4 mt-0.5 border-l border-sidebar-border pl-2">
                  {group.children.map(item => {
                    const ItemIcon = item.icon;
                    const isActive = location.pathname === item.path || location.pathname.startsWith((item.path ?? '') + '/');
                    return (
                      <Link
                        key={item.path}
                        to={item.path!}
                        onClick={onNavClick}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs transition-colors duration-150 my-0.5',
                          isActive
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary'
                        )}
                      >
                        <ItemIcon size={13} className="shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {/* 底部用户信息 */}
      <div className="px-3 py-3 border-t border-sidebar-border shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-sm bg-muted flex items-center justify-center shrink-0">
            <Users size={13} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-sidebar-foreground truncate">{adminProfile?.display_name ?? adminProfile?.email ?? '管理员'}</p>
            <p className="text-xs text-muted-foreground">{role ? ROLE_LABELS[role] : ''}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-start gap-2 text-xs border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary h-8"
        >
          <LogOut size={12} />
          退出登录
        </Button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* 桌面端侧边栏 */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border">
        <SidebarContent />
      </aside>

      {/* 主内容区 */}
      <div className="flex-1 min-w-0 flex flex-col overflow-x-hidden">
        {/* 顶部导航栏 */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          {/* 移动端汉堡 */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden border border-border w-8 h-8">
                <Menu size={16} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-56 bg-sidebar border-r border-sidebar-border">
              <SidebarContent onNavClick={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1 min-w-0" />

          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
            系统正常运行
          </div>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
