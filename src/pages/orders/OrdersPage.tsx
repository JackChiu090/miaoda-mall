import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase } from '@/db/supabase';
import { settleSellerEarnings } from '@/lib/settlement';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Eye, Search, Download, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import type { Order } from '@/types/types';

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Order | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  // 勾选状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteSelectedConfirm, setDeleteSelectedConfirm] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [rewardMap, setRewardMap] = useState<Record<string, number>>({}); // order_id → 推广佣金金额
  const [directRewardMap, setDirectRewardMap] = useState<Record<string, number>>({}); // order_id → 直接奖励金额
  const selectAllRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 当前页全选状态
  const pageIds = orders.map(o => o.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const somePageSelected = pageIds.some(id => selectedIds.has(id)) && !allPageSelected;

  // 更新全选 checkbox indeterminate 状态
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  // 换页/筛选时清空选中
  useEffect(() => { setSelectedIds(new Set()); }, [page, statusFilter, search]);

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds(prev => { const s = new Set(prev); pageIds.forEach(id => s.delete(id)); return s; });
    } else {
      setSelectedIds(prev => { const s = new Set(prev); pageIds.forEach(id => s.add(id)); return s; });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setDeletingSelected(true);
    await cleanOrderRefs(ids);
    const { error } = await supabase.from('orders').delete().in('id', ids);
    setDeletingSelected(false);
    if (error) { toast.error('删除失败：' + error.message); return; }
    toast.success(`已删除 ${ids.length} 条订单`);
    setDeleteSelectedConfirm(false);
    setSelectedIds(new Set());
    fetchOrders();
  }

  // 删除订单前清理所有引用该订单的外键关联记录
  async function cleanOrderRefs(ids: string[]) {
    if (!ids.length) return;
    await Promise.all([
      supabase.from('order_status_logs').delete().in('order_id', ids),
      supabase.from('transfer_records').delete().in('from_order_id', ids),
      supabase.from('transfer_records').delete().in('new_order_id', ids),
      supabase.from('account_transactions').delete().in('related_order_id', ids),
      supabase.from('commission_records').delete().in('order_id', ids),
      supabase.from('user_coupons').update({ used_order_id: null }).in('used_order_id', ids),
      supabase.from('products').update({ origin_order_id: null }).in('origin_order_id', ids),
    ]);
  }

  async function handleDeleteOrder(order: Order) {
    setDeleting(true);
    await cleanOrderRefs([order.id]);
    const { error } = await supabase.from('orders').delete().eq('id', order.id);
    setDeleting(false);
    if (error) { toast.error('删除失败：' + error.message); return; }
    toast.success('订单已删除');
    setDeleteTarget(null);
    fetchOrders();
  }

  async function handleDeleteAll() {
    setDeletingAll(true);
    let selQ = supabase.from('orders').select('id');
    if (statusFilter !== 'all') selQ = selQ.eq('status', statusFilter);
    if (search) selQ = selQ.ilike('order_no', `%${search}%`);
    const { data: rows, error: selErr } = await selQ;
    if (selErr) { toast.error('查询失败：' + selErr.message); setDeletingAll(false); return; }
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) { toast.info('没有可删除的订单'); setDeletingAll(false); setDeleteAllConfirm(false); return; }
    await cleanOrderRefs(ids);
    const { error } = await supabase.from('orders').delete().in('id', ids);
    setDeletingAll(false);
    if (error) { toast.error('批量删除失败：' + error.message); return; }
    toast.success(`已删除 ${ids.length} 条订单`);
    setDeleteAllConfirm(false);
    setPage(1);
    fetchOrders();
  }

  async function handleConfirmPayment(order: Order) {
    setConfirming(true);
    // 1. 更新订单状态
    const { error: updErr } = await supabase.from('orders')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', order.id).eq('status', 'payment_uploaded');
    if (updErr) { toast.error('确认失败：' + updErr.message); setConfirming(false); return; }

    // 2. 写状态日志
    await supabase.from('order_status_logs').insert({
      order_id: order.id, from_status: 'payment_uploaded', to_status: 'confirmed',
      operator_type: 'admin', remark: '后台管理员确认收款',
    });

    // 3. 结算卖方收益 + 分润分配
    if (order.seller_id) {
      const { netAmount, serviceFee } = await settleSellerEarnings({
        orderId: order.id, sellerId: order.seller_id,
        buyerId: order.buyer_id ?? '',
        orderAmount: Number(order.amount),
      });
      toast.success('已确认收款');
    } else {
      toast.success('已确认收款');
    }

    setConfirming(false);
    setConfirmTarget(null);
    fetchOrders();
  }

  async function fetchOrders() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    let q = supabase.from('orders').select(
      '*, buyer:buyer_id(phone,nickname), seller:seller_id(phone,nickname), product:product_id(title,images)',
      { count: 'exact' }
    );
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (search) q = q.ilike('order_no', `%${search}%`);
    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
    if (error) { toast.error('加载失败'); setLoading(false); return; }
    const list = Array.isArray(data) ? data : [];
    setOrders(list);
    setTotal(count ?? 0);

    // 关联拉取当前页推广佣金 + 直接奖励
    const ids = list.map(o => o.id);
    if (ids.length > 0) {
      const [rewardRes, directRes] = await Promise.all([
        supabase.from('referral_rewards').select('order_id, amount').in('order_id', ids),
        // 直接奖励：订单完成后按 0.2% 发放给买方直接推荐人的 promotion 入账
        supabase.from('account_transactions')
          .select('related_order_id, amount')
          .eq('account_type', 'promotion')
          .eq('type', 'in')
          .in('related_order_id', ids),
      ]);
      const map: Record<string, number> = {};
      (rewardRes.data ?? []).forEach((r: any) => { map[r.order_id] = Number(r.amount ?? 0); });
      setRewardMap(map);
      const dmap: Record<string, number> = {};
      (directRes.data ?? []).forEach((r: any) => {
        if (r.related_order_id) dmap[r.related_order_id] = Number(r.amount ?? 0);
      });
      setDirectRewardMap(dmap);
    } else {
      setRewardMap({});
      setDirectRewardMap({});
    }
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, [page, statusFilter, search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const ORDER_STATUSES = [
    { value: 'all', label: '全部状态' },
    { value: 'pending_payment', label: '待付款' },
    { value: 'payment_uploaded', label: '凭证已上传' },
    { value: 'confirmed', label: '已确认' },
    { value: 'completed', label: '已完成' },
    { value: 'cancelled', label: '已取消' },
    { value: 'disputed', label: '争议中' },
  ];

  const STATUS_LABEL_MAP: Record<string, string> = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s.label]));

  type OrderRow = Order & { buyer?: { phone: string; nickname: string }; seller?: { phone: string; nickname: string }; product?: { title: string } };

  function buildExcelRows(data: OrderRow[], rewards: Record<string, number> = {}, directRewards: Record<string, number> = {}) {
    return data.map(o => ({
      '订单号': o.order_no,
      '商品名称': o.product?.title ?? '-',
      '买方手机': o.buyer?.phone ?? '-',
      '买方昵称': o.buyer?.nickname ?? '-',
      '卖方手机': o.seller?.phone ?? '-',
      '订单金额': Number(o.amount).toFixed(2),
      '推广佣金': ['confirmed', 'completed'].includes(o.status)
        ? (rewards[o.id] ?? 0).toFixed(2)
        : '待结算',
      '直接奖励': ['confirmed', 'completed'].includes(o.status)
        ? (directRewards[o.id] ?? 0) > 0
          ? (directRewards[o.id]).toFixed(2)
          : '-'
        : '-',
      '订单状态': STATUS_LABEL_MAP[o.status] ?? o.status,
      '创建时间': new Date(o.created_at).toLocaleString('zh-CN'),
      '完成时间': o.completed_at ? new Date(o.completed_at).toLocaleString('zh-CN') : '',
      '取消原因': o.cancel_reason ?? '',
    }));
  }

  function downloadExcel(rows: ReturnType<typeof buildExcelRows>, filename: string) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '订单列表');
    XLSX.writeFile(wb, filename);
  }

  async function handleExportAll() {
    setExporting(true);
    try {
      let q = supabase.from('orders').select(
        '*, buyer:buyer_id(phone,nickname), seller:seller_id(phone,nickname), product:product_id(title)'
      );
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (search) q = q.ilike('order_no', `%${search}%`);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      const list = (data ?? []) as OrderRow[];
      const ids = list.map(o => o.id);
      const [rewardRes, directRes] = await Promise.all([
        supabase.from('referral_rewards').select('order_id, amount').in('order_id', ids),
        supabase.from('account_transactions').select('related_order_id, amount')
          .eq('account_type', 'promotion').eq('type', 'in').in('related_order_id', ids),
      ]);
      const rewards: Record<string, number> = {};
      (rewardRes.data ?? []).forEach((r: any) => { rewards[r.order_id] = Number(r.amount ?? 0); });
      const directRewards: Record<string, number> = {};
      (directRes.data ?? []).forEach((r: any) => { if (r.related_order_id) directRewards[r.related_order_id] = Number(r.amount ?? 0); });
      const rows = buildExcelRows(list, rewards, directRewards);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadExcel(rows, `订单列表_全部_${dateStr}.xlsx`);
      toast.success(`已导出 ${rows.length} 条订单数据`);
    } catch (err: unknown) {
      toast.error('导出失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
    setExporting(false);
  }

  async function handleExportToday() {
    setExporting(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.from('orders').select(
        '*, buyer:buyer_id(phone,nickname), seller:seller_id(phone,nickname), product:product_id(title)'
      )
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as OrderRow[];
      const ids = list.map(o => o.id);
      const [rewardRes, directRes] = await Promise.all([
        supabase.from('referral_rewards').select('order_id, amount').in('order_id', ids),
        supabase.from('account_transactions').select('related_order_id, amount')
          .eq('account_type', 'promotion').eq('type', 'in').in('related_order_id', ids),
      ]);
      const rewards: Record<string, number> = {};
      (rewardRes.data ?? []).forEach((r: any) => { rewards[r.order_id] = Number(r.amount ?? 0); });
      const directRewards: Record<string, number> = {};
      (directRes.data ?? []).forEach((r: any) => { if (r.related_order_id) directRewards[r.related_order_id] = Number(r.amount ?? 0); });
      const rows = buildExcelRows(list, rewards, directRewards);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadExcel(rows, `订单列表_当日_${dateStr}.xlsx`);
      toast.success(`当日共 ${rows.length} 条订单已导出`);
    } catch (err: unknown) {
      toast.error('导出失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
    setExporting(false);
  }

  return (
    <>
    <AdminLayout>
      <PageHeader title="订单列表" description={`共 ${total} 笔订单`}
        action={
          <div className="flex gap-1.5 flex-wrap">
            <Button size="sm" variant="ghost" disabled={exporting} onClick={handleExportToday}
              className="h-8 gap-1.5 text-xs border border-border">
              <Download size={13} />{exporting ? '导出中...' : '当日导出'}
            </Button>
            <Button size="sm" variant="ghost" disabled={exporting} onClick={handleExportAll}
              className="h-8 gap-1.5 text-xs border border-border">
              <Download size={13} />{exporting ? '导出中...' : '导出全部'}
            </Button>
            {selectedIds.size > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setDeleteSelectedConfirm(true)}
                className="h-8 gap-1.5 text-xs border border-destructive/60 text-destructive hover:bg-destructive/10">
                <Trash2 size={13} />删除选中（{selectedIds.size} 条）
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setDeleteAllConfirm(true)}
                className="h-8 gap-1.5 text-xs border border-destructive/50 text-destructive hover:bg-destructive/10">
                <Trash2 size={13} />一键删除
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索订单号" className="pl-8 h-8 text-xs bg-muted border-border" />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2.5 w-8">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 cursor-pointer accent-primary"
                  title="全选当前页"
                />
              </th>
              {['订单号', '商品', '买方', '卖方', '金额', '推广佣金', '直接奖励', '状态', '创建时间', '操作'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={11} className="py-10 text-center text-xs text-muted-foreground">暂无订单</td></tr>
            ) : orders.map((order, i) => (
              <tr key={order.id} className={`border-b border-border last:border-0 ${selectedIds.has(order.id) ? 'bg-primary/5' : i % 2 === 1 ? 'bg-muted/30' : ''}`}>
                <td className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(order.id)}
                    onChange={() => toggleSelect(order.id)}
                    className="w-3.5 h-3.5 cursor-pointer accent-primary"
                  />
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono text-muted-foreground">{order.order_no}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap max-w-32 truncate">{(order.product as any)?.title ?? '-'}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <div className="font-mono">{(order.buyer as any)?.phone ?? '-'}</div>
                  {(order.buyer as any)?.nickname && (
                    <div className="text-muted-foreground text-[11px]">{(order.buyer as any).nickname}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  <div className="font-mono">{(order.seller as any)?.phone ?? '-'}</div>
                  {(order.seller as any)?.nickname && (
                    <div className="text-muted-foreground text-[11px]">{(order.seller as any).nickname}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono font-medium text-primary">
                  ¥{Number(order.amount).toFixed(2)}
                </td>
                {/* 推广佣金：未完成显示"待结算"，完成后显示实际佣金（绿色）或 ¥0.00（灰色） */}
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">
                  {['confirmed', 'completed'].includes(order.status)
                    ? (rewardMap[order.id] ?? 0) > 0
                      ? <span className="text-green-600 dark:text-green-400 font-medium">¥{rewardMap[order.id].toFixed(2)}</span>
                      : <span className="text-muted-foreground">¥0.00</span>
                    : <span className="text-muted-foreground">待结算</span>
                  }
                </td>
                {/* 直接奖励：订单完成后按 0.2% 发放给买方直接推荐人；无推荐人或未产生奖励显示「-」 */}
                <td className="px-3 py-2.5 text-xs whitespace-nowrap font-mono">
                  {['confirmed', 'completed'].includes(order.status)
                    ? (directRewardMap[order.id] ?? 0) > 0
                      ? <span className="text-green-600 dark:text-green-400 font-medium">¥{directRewardMap[order.id].toFixed(2)}</span>
                      : <span className="text-muted-foreground">-</span>
                    : <span className="text-muted-foreground">-</span>
                  }
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap"><StatusBadge status={order.status} /></td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {order.status === 'payment_uploaded' && (
                      <Button variant="ghost" size="sm"
                        onClick={() => setConfirmTarget(order)}
                        className="h-6 px-2 text-xs border border-border text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30">
                        <CheckCircle2 size={11} className="mr-1" />确认收款
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/orders/${order.id}`)}
                      className="h-6 px-2 text-xs border border-border">
                      <Eye size={11} className="mr-1" />详情
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(order)}
                      className="h-6 px-2 text-xs border border-destructive/40 text-destructive hover:bg-destructive/10">
                      <Trash2 size={11} />
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
    </AdminLayout>

    {/* 删除选中弹窗 */}
    <AlertDialog open={deleteSelectedConfirm} onOpenChange={open => { if (!open) setDeleteSelectedConfirm(false); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 size={16} className="text-destructive" />删除选中订单
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-1">
            <span className="block">已选中 <span className="font-semibold text-foreground">{selectedIds.size}</span> 条订单，确认删除？</span>
            <span className="block text-destructive mt-1">删除后不可恢复，请谨慎操作。</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingSelected}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deletingSelected}
            onClick={handleDeleteSelected}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
          >
            {deletingSelected && <RefreshCw size={13} className="animate-spin" />}
            {deletingSelected ? '删除中…' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 确认收款弹窗 */}
    <AlertDialog open={!!confirmTarget} onOpenChange={open => { if (!open) setConfirmTarget(null); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" />确认收款
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-1">
            <span className="block">订单号：<span className="font-mono text-foreground">{confirmTarget?.order_no}</span></span>
            <span className="block">金额：<span className="font-semibold text-foreground">¥{Number(confirmTarget?.amount ?? 0).toFixed(2)}</span></span>
            <span className="block text-warning mt-1">确认后将自动结算卖方收益，此操作不可撤销。</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirming}
            onClick={() => confirmTarget && handleConfirmPayment(confirmTarget)}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            {confirming && <RefreshCw size={13} className="animate-spin" />}
            {confirming ? '处理中…' : '确认收款'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 单条删除弹窗 */}
    <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 size={16} className="text-destructive" />删除订单
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-1">
            <span className="block">订单号：<span className="font-mono text-foreground">{deleteTarget?.order_no}</span></span>
            <span className="block text-destructive mt-1">删除后不可恢复，请谨慎操作。</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={() => deleteTarget && handleDeleteOrder(deleteTarget)}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
          >
            {deleting && <RefreshCw size={13} className="animate-spin" />}
            {deleting ? '删除中…' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* 一键删除弹窗 */}
    <AlertDialog open={deleteAllConfirm} onOpenChange={open => { if (!open) setDeleteAllConfirm(false); }}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 size={16} className="text-destructive" />一键删除
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-1">
            <span className="block">将删除当前筛选条件下的 <span className="font-semibold text-foreground">{total}</span> 条订单。</span>
            <span className="block text-destructive mt-1">⚠️ 此操作不可恢复，请务必确认！</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingAll}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deletingAll}
            onClick={handleDeleteAll}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
          >
            {deletingAll && <RefreshCw size={13} className="animate-spin" />}
            {deletingAll ? '删除中…' : '确认全部删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
