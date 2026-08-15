// 出勤监控：商家每日抢购出勤情况查看（体验商家1单/正式商家2单）
import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  RefreshCw, Users, BarChart2, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';

interface AttendanceUser {
  id: string;
  real_name: string | null;
  nickname: string;
  merchant_type: 'trial' | 'regular';
  today_orders: number;
  required_orders: number;
  status: 'reached' | 'missed' | 'partial';
}

export default function DailyScreeningPage() {
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const [users, setUsers] = useState<AttendanceUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalTrial, setTotalTrial] = useState(0);
  const [totalRegular, setTotalRegular] = useState(0);
  const [reachedCount, setReachedCount] = useState(0);
  const [missedCount, setMissedCount] = useState(0);

  async function load() {
    setLoading(true);
    // 查询所有商家用户（非禁用）
    const { data: merchants } = await supabase
      .from('users')
      .select('id, real_name, nickname, merchant_type')
      .in('merchant_type', ['trial', 'regular'])
      .eq('is_banned', false);

    if (!merchants) { setLoading(false); return; }

    // 查询所选日期内每位商家的抢购订单数
    const dayStart = `${dateFilter}T00:00:00+08:00`;
    const dayEnd   = `${dateFilter}T23:59:59+08:00`;
    const { data: orders } = await supabase
      .from('orders')
      .select('buyer_id')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);

    const orderMap: Record<string, number> = {};
    (orders ?? []).forEach(o => {
      if (o.buyer_id) orderMap[o.buyer_id] = (orderMap[o.buyer_id] ?? 0) + 1;
    });

    const result: AttendanceUser[] = merchants.map(u => {
      const required = u.merchant_type === 'regular' ? 2 : 1;
      const today = orderMap[u.id] ?? 0;
      const status: AttendanceUser['status'] =
        today >= required ? 'reached' : today > 0 ? 'partial' : 'missed';
      return { ...u, today_orders: today, required_orders: required, status };
    });

    const trial   = result.filter(u => u.merchant_type === 'trial').length;
    const regular = result.filter(u => u.merchant_type === 'regular').length;
    const reached = result.filter(u => u.status === 'reached').length;
    const missed  = result.filter(u => u.status !== 'reached').length;

    setUsers(result);
    setTotalTrial(trial);
    setTotalRegular(regular);
    setReachedCount(reached);
    setMissedCount(missed);
    setLoading(false);
  }

  useEffect(() => { load(); }, [dateFilter]);

  const statusBadge = (s: AttendanceUser['status']) => {
    if (s === 'reached') return <Badge variant="outline" className="text-xs gap-1 border-success/40 text-success"><CheckCircle2 size={10} />已达标</Badge>;
    if (s === 'partial') return <Badge variant="secondary" className="text-xs gap-1"><Clock size={10} />部分完成</Badge>;
    return <Badge variant="destructive" className="text-xs gap-1"><XCircle size={10} />未出勤</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="出勤监控"
        description="体验商家每日至少抢购1单（15个工作日内），正式商家每日至少抢购2单；工作日9:29早场、9:30主场开放抢购"
        action={
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw size={14} />刷新
          </Button>
        }
      />

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">体验商家</p>
          <p className="text-2xl font-bold">{totalTrial}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">正式商家</p>
          <p className="text-2xl font-bold">{totalRegular}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">已达标</p>
          <p className="text-2xl font-bold text-success">{reachedCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">未达标</p>
          <p className="text-2xl font-bold text-destructive">{missedCount}</p>
        </div>
      </div>

      {/* 日期筛选 */}
      <div className="max-w-xs">
        <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
      </div>

      {/* 出勤明细表 */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">商家姓名</TableHead>
              <TableHead className="whitespace-nowrap">昵称</TableHead>
              <TableHead className="whitespace-nowrap">商家类型</TableHead>
              <TableHead className="whitespace-nowrap">今日已抢</TableHead>
              <TableHead className="whitespace-nowrap">要求单数</TableHead>
              <TableHead className="whitespace-nowrap">出勤状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  暂无商家数据
                </TableCell>
              </TableRow>
            ) : (
              users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium whitespace-nowrap">{u.real_name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{u.nickname}</TableCell>
                  <TableCell>
                    <Badge variant={u.merchant_type === 'regular' ? 'default' : 'secondary'} className="text-xs whitespace-nowrap">
                      {u.merchant_type === 'regular' ? '正式商家' : '体验商家'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <BarChart2 size={13} className="text-muted-foreground" />
                      <span className={u.today_orders >= u.required_orders ? 'text-success font-medium' : ''}>
                        {u.today_orders}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users size={13} className="text-muted-foreground" />
                      {u.required_orders}
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(u.status)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface _LegacyScreeningUnused {} // removed old duplicate component
