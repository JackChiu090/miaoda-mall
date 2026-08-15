import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import KpiCard from '@/components/common/KpiCard';
import { Users, Package, ShoppingCart, Wallet, TrendingUp, AlertCircle, Activity } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend
} from 'recharts';

interface Stats {
  totalUsers: number;
  newUsersToday: number;
  pendingKyc: number;
  totalProducts: number;
  pendingProducts: number;
  totalOrders: number;
  todayOrders: number;
  completedOrders: number;
  pendingWithdrawals: number;
  voucherPool: number;
}

const CHART_COLORS = ['hsl(26,100%,48%)', 'hsl(221,65%,55%)', 'hsl(160,50%,45%)', 'hsl(26,100%,65%)', 'hsl(221,65%,70%)'];

// 模拟最近7天趋势数据
function genTrendData() {
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return days.map(day => ({
    day,
    订单: Math.floor(Math.random() * 50 + 10),
    用户: Math.floor(Math.random() * 20 + 5),
    交易额: Math.floor(Math.random() * 10000 + 2000),
  }));
}

const ORDER_STATUS_DATA = [
  { name: '待付款', value: 12 },
  { name: '凭证已传', value: 8 },
  { name: '已完成', value: 45 },
  { name: '已取消', value: 6 },
  { name: '争议中', value: 3 },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, newUsersToday: 0, pendingKyc: 0,
    totalProducts: 0, pendingProducts: 0,
    totalOrders: 0, todayOrders: 0, completedOrders: 0,
    pendingWithdrawals: 0, voucherPool: 0,
  });
  const [trendData] = useState(genTrendData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
          { count: totalUsers },
          { count: newUsersToday },
          { count: pendingKyc },
          { count: totalProducts },
          { count: pendingProducts },
          { count: totalOrders },
          { count: todayOrders },
          { count: completedOrders },
          { count: pendingWithdrawals },
          voucherRes,
        ] = await Promise.all([
          supabase.from('users').select('*', { count: 'exact', head: true }),
          supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
          supabase.from('kyc_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('products').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('orders').select('*', { count: 'exact', head: true }),
          supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
          supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('voucher_pool').select('accumulated').order('id', { ascending: true }).limit(1).maybeSingle(),
        ]);

        setStats({
          totalUsers: totalUsers ?? 0,
          newUsersToday: newUsersToday ?? 0,
          pendingKyc: pendingKyc ?? 0,
          totalProducts: totalProducts ?? 0,
          pendingProducts: pendingProducts ?? 0,
          totalOrders: totalOrders ?? 0,
          todayOrders: todayOrders ?? 0,
          completedOrders: completedOrders ?? 0,
          pendingWithdrawals: pendingWithdrawals ?? 0,
          voucherPool: voucherRes.data?.accumulated ?? 0,
        });
      } catch (err) {
        console.error('仪表盘数据加载失败', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-sm px-3 py-2 text-xs shadow-none">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}：{p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <AdminLayout>
      <PageHeader title="数据仪表盘" description="平台实时运营数据概览" showBack={false} />

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard title="注册用户" value={loading ? '-' : stats.totalUsers} icon={Users} change={8.2} changeLabel="较上周" />
        <KpiCard title="今日新增用户" value={loading ? '-' : stats.newUsersToday} icon={TrendingUp} />
        <KpiCard title="累计订单" value={loading ? '-' : stats.totalOrders} icon={ShoppingCart} change={12.5} changeLabel="较上周" />
        <KpiCard title="今日订单" value={loading ? '-' : stats.todayOrders} icon={Activity} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard title="在架商品" value={loading ? '-' : stats.totalProducts} icon={Package} />
        <KpiCard title="已完成订单" value={loading ? '-' : stats.completedOrders} icon={ShoppingCart} />
        <KpiCard title="代金券资金池" value={loading ? '-' : `¥${Number(stats.voucherPool).toFixed(2)}`} icon={Wallet} />
        <div className="bg-card border border-border rounded-sm p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className="text-xs text-muted-foreground">待处理事项</p>
            <AlertCircle size={14} className="text-warning shrink-0" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">待审实名</span>
              <span className={stats.pendingKyc > 0 ? 'text-warning font-medium' : 'text-foreground'}>{loading ? '-' : stats.pendingKyc}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">待审商品</span>
              <span className={stats.pendingProducts > 0 ? 'text-warning font-medium' : 'text-foreground'}>{loading ? '-' : stats.pendingProducts}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">待审提现</span>
              <span className={stats.pendingWithdrawals > 0 ? 'text-warning font-medium' : 'text-foreground'}>{loading ? '-' : stats.pendingWithdrawals}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 近7天趋势 */}
        <div className="bg-card border border-border rounded-sm p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">近7天订单&用户趋势</h3>
          <div className="w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend layout="horizontal" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="订单" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="用户" stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 交易额柱图 */}
        <div className="bg-card border border-border rounded-sm p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">近7天交易额（元）</h3>
          <div className="w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="交易额" fill={CHART_COLORS[1]} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 订单状态分布 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-sm p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">订单状态分布</h3>
          <div className="w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={ORDER_STATUS_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  dataKey="value" nameKey="name" paddingAngle={2}>
                  {ORDER_STATUS_DATA.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend layout="horizontal" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 分润比例说明 */}
        <div className="bg-card border border-border rounded-sm p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">分润计提规则</h3>
          <div className="space-y-2">
            {[
              { label: '商家分红',   rate: '1%',   desc: '订单交易完成后，自动发放给买单用户', color: CHART_COLORS[0] },
              { label: '老板分红',   rate: '1.5%', desc: '订单交易完成后，实时结算至奖金账户', color: CHART_COLORS[1] },
              { label: '直接奖励',   rate: '0.2%', desc: '订单交易完成后，直接奖励给推荐人', color: CHART_COLORS[2] },
              { label: '代金券储备', rate: '0.3%', desc: '订单交易完成后，存入代金券资金池，累计满¥3980兑换实物', color: CHART_COLORS[3] },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{item.label}</span>
                    <span className="text-xs font-medium text-primary shrink-0">{item.rate}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">合计计提</span>
                <span className="text-xs font-medium text-primary">3.0%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
