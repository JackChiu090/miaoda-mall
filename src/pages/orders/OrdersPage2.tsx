import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Download, RefreshCw } from 'lucide-react';

interface OrderRow2 {
  id: string;
  order_no: string;
  amount: number;               // 今日卖出价格
  consignment_price: number;    // 今日买入价格
  original_price: number;       // 前日买入价格
  status: string;
  created_at: string;
  completed_at: string | null;
  buyer_name: string;
  buyer_phone: string;
  seller_name: string;
  seller_phone: string;
  coupon_count: number;
  product_title: string;
  direct_reward: number;        // 直接奖励（推荐奖励）
  reward_recipient_name: string; // 推荐奖励接收人姓名
}

const PAGE_SIZE = 20;

// 用户展示名：优先真实姓名，其次昵称，再退回手机号
function displayName(u: { real_name?: string; nickname?: string; phone?: string } | undefined): string {
  if (!u) return '-';
  return u.real_name || u.nickname || u.phone || '-';
}

const ORDER_STATUSES = [
  { value: 'all', label: '全部状态' },
  { value: 'pending_payment', label: '待付款' },
  { value: 'payment_uploaded', label: '凭证已上传' },
  { value: 'confirmed', label: '已确认' },
  { value: 'resell_listed', label: '转拍上架' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
  { value: 'disputed', label: '争议中' },
];

export default function OrdersPage2() {
  const [rows, setRows] = useState<OrderRow2[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);


  function buildQuery(forExport = false) {
    let q = supabase.from('orders').select(
      'id, order_no, amount, status, created_at, completed_at, buyer_id, seller_id, product:product_id(consignment_price, original_price, title)',
      forExport ? undefined : { count: 'exact' }
    );
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (search) {
      q = q.or(`order_no.ilike.%${search}%`);
    }
    return q.order('created_at', { ascending: false });
  }

  async function fetchOrders() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const { data, count, error } = await buildQuery()
      .range(from, from + PAGE_SIZE - 1);

    if (error) { toast.error('加载失败：' + error.message); setLoading(false); return; }

    const orderList = (data ?? []) as any[];
    const orderIds = orderList.map(o => o.id);

    // 批量查买家、卖家信息
    const userIds = [...new Set([
      ...orderList.map(o => o.buyer_id),
      ...orderList.map(o => o.seller_id),
    ].filter(Boolean))];
    const { data: userData } = await supabase
      .from('users').select('id, real_name, nickname, phone').in('id', userIds);
    const userMap: Record<string, { real_name: string; nickname: string; phone: string }> = {};
    (userData ?? []).forEach((u: any) => { userMap[u.id] = u; });

    // 按会员手机/姓名过滤（若搜索词不像订单号则走用户字段过滤）
    let filteredList = orderList;
    if (search && !/^[A-Z0-9-]+$/i.test(search)) {
      filteredList = orderList.filter(o => {
        const buyer = userMap[o.buyer_id];
        const seller = userMap[o.seller_id];
        const match = (u?: { real_name?: string; nickname?: string; phone?: string }) =>
          !!u && ((u.phone ?? '').includes(search) || (u.real_name ?? '').includes(search) || (u.nickname ?? '').includes(search));
        return match(buyer) || match(seller);
      });
    }

    // 批量查代金券消耗数量
    const { data: couponData } = await supabase
      .from('user_coupons').select('used_order_id')
      .in('used_order_id', orderIds).eq('status', 'used');
    const couponCount: Record<string, number> = {};
    (couponData ?? []).forEach((c: any) => {
      couponCount[c.used_order_id] = (couponCount[c.used_order_id] ?? 0) + 1;
    });

    // 批量查每笔订单的直接奖励：从 account_transactions 取（promotion 账户「直接奖励」入账，0.2%）
    const { data: rewardData } = await supabase
      .from('account_transactions')
      .select('related_order_id, amount')
      .eq('account_type', 'promotion')
      .eq('type', 'in')
      .ilike('description', '直接奖励%')
      .in('related_order_id', orderIds);
    const rewardMap: Record<string, { amount: number; recipient_name: string }> = {};
    (rewardData ?? []).forEach((r: any) => {
      if (r.related_order_id) rewardMap[r.related_order_id] = {
        amount: Number(r.amount ?? 0),
        recipient_name: '-',
      };
    });

    const result: OrderRow2[] = filteredList.map(o => ({
      id: o.id,
      order_no: o.order_no,
      amount: Number(o.amount),
      consignment_price: Number(o.product?.consignment_price ?? 0),
      original_price: Number(o.product?.original_price ?? 0),
      status: o.status,
      created_at: o.created_at,
      completed_at: o.completed_at ?? null,
      buyer_name: displayName(userMap[o.buyer_id]),
      buyer_phone: userMap[o.buyer_id]?.phone ?? '-',
      seller_name: displayName(userMap[o.seller_id]),
      seller_phone: userMap[o.seller_id]?.phone ?? '-',
      coupon_count: couponCount[o.id] ?? 0,
      product_title: o.product?.title ?? '-',
      direct_reward: rewardMap[o.id]?.amount ?? 0,
      reward_recipient_name: rewardMap[o.id]?.recipient_name ?? '-',
    }));

    setRows(result);
    setTotal(count ?? 0);
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, [page, statusFilter, search]);

  // 费用计算
  function calcFees(r: OrderRow2) {
    const resellFee = r.consignment_price * 0.01;              // 转拍上架费 1%
    const diff = r.amount - r.consignment_price - resellFee;   // 差额
    return { resellFee, diff };
  }

  // Excel 导出
  async function handleExport() {
    setExporting(true);
    try {
      const { data, error } = await buildQuery(true).limit(5000);
      if (error) throw error;
      const list = (data ?? []) as any[];
      const ids = list.map(o => o.id);
      const userIds = [...new Set([
        ...list.map(o => o.buyer_id),
        ...list.map(o => o.seller_id),
      ].filter(Boolean))];
      const [{ data: userData }, { data: couponData }, { data: rewardData }] = await Promise.all([
        supabase.from('users').select('id, real_name, nickname, phone').in('id', userIds),
        supabase.from('user_coupons').select('used_order_id').in('used_order_id', ids).eq('status', 'used'),
        supabase.from('account_transactions').select('related_order_id, amount')
          .eq('account_type', 'promotion').eq('type', 'in')
          .ilike('description', '直接奖励%').in('related_order_id', ids),
      ]);
      const userMap: Record<string, any> = {};
      (userData ?? []).forEach((u: any) => { userMap[u.id] = u; });
      const couponCount: Record<string, number> = {};
      (couponData ?? []).forEach((c: any) => {
        couponCount[c.used_order_id] = (couponCount[c.used_order_id] ?? 0) + 1;
      });
      const rewardMap: Record<string, { amount: number; recipient_name: string }> = {};
      (rewardData ?? []).forEach((r: any) => {
        if (r.related_order_id) rewardMap[r.related_order_id] = {
          amount: Number(r.amount ?? 0),
          recipient_name: '-',
        };
      });

      const excelRows = list.map(o => {
        const r: OrderRow2 = {
          id: o.id, order_no: o.order_no, amount: Number(o.amount), status: o.status,
          created_at: o.created_at,
          completed_at: o.completed_at ?? null,
          consignment_price: Number(o.product?.consignment_price ?? 0),
          original_price: Number(o.product?.original_price ?? 0),
          buyer_name: displayName(userMap[o.buyer_id]),
          buyer_phone: userMap[o.buyer_id]?.phone ?? '-',
          seller_name: displayName(userMap[o.seller_id]),
          seller_phone: userMap[o.seller_id]?.phone ?? '-',
          coupon_count: couponCount[o.id] ?? 0,
          product_title: o.product?.title ?? '-',
          direct_reward: rewardMap[o.id]?.amount ?? 0,
          reward_recipient_name: rewardMap[o.id]?.recipient_name ?? '-',
        };
        const { resellFee, diff } = calcFees(r);
        return {
          '订单编号': r.order_no,
          '商品名称': r.product_title,
          '买家姓名': r.buyer_name,
          '买家电话': r.buyer_phone,
          '卖家姓名': r.seller_name,
          '卖家电话': r.seller_phone,
          '前日买入价格': r.original_price.toFixed(2),
          '今日卖出价格': r.amount.toFixed(2),
          '今日买入价格': r.consignment_price.toFixed(2),
          '转拍上架费(1%)': resellFee.toFixed(2),
          '差额': diff.toFixed(2),
          '直接奖励': r.direct_reward > 0 ? r.direct_reward.toFixed(2) : '-',
          '代金券消耗数量': r.coupon_count,
          '订单状态': ORDER_STATUSES.find(s => s.value === r.status)?.label ?? r.status,
          '下单时间': new Date(r.created_at).toLocaleString('zh-CN'),
          '完成时间': r.completed_at ? new Date(r.completed_at).toLocaleString('zh-CN') : '-',
        };
      });

      const ws = XLSX.utils.json_to_sheet(excelRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '订单列表2');
      XLSX.writeFile(wb, `订单列表2_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`已导出 ${excelRows.length} 条数据`);
    } catch (err: unknown) {
      toast.error('导出失败：' + (err instanceof Error ? err.message : '未知错误'));
    }
    setExporting(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const STATUS_LABEL_MAP = Object.fromEntries(ORDER_STATUSES.map(s => [s.value, s.label]));

  return (
    <AdminLayout>
      <PageHeader
        title="订单列表2"
        description={`共 ${total} 条记录`}
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={fetchOrders}
              className="h-8 gap-1.5 text-xs border border-border">
              <RefreshCw size={13} />刷新
            </Button>
            <Button size="sm" variant="ghost" disabled={exporting} onClick={handleExport}
              className="h-8 gap-1.5 text-xs border border-border">
              <Download size={13} />{exporting ? '导出中...' : '导出 Excel'}
            </Button>
          </div>
        }
      />

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索订单号 / 会员姓名 / 手机号"
            className="pl-8 h-8 text-xs bg-muted border-border"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs bg-muted border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 数据表格 */}
      <div className="bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {[
                '订单编号',
                '商品名称',
                '买家姓名', '买家电话',
                '卖家姓名', '卖家电话',
                '前日买入价', '今日卖出价', '今日买入价',
                '转拍上架费(1%)', '差额',
                '直接奖励',
                '代金券消耗', '状态', '下单时间', '完成时间',
              ].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={16} className="py-10 text-center text-xs text-muted-foreground">加载中...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={16} className="py-10 text-center text-xs text-muted-foreground">暂无数据</td></tr>
            ) : rows.map((r, i) => {
              const { resellFee, diff } = calcFees(r);
              return (
                <tr key={r.id} className={`border-b border-border last:border-0 ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                  {/* 订单编号 */}
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.order_no}</td>
                  {/* 商品名称 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap max-w-[160px] truncate">{r.product_title}</td>
                  {/* 买家姓名 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{r.buyer_name}</td>
                  {/* 买家电话 */}
                  <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap">{r.buyer_phone}</td>
                  {/* 卖家姓名 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">{r.seller_name}</td>
                  {/* 卖家电话 */}
                  <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap">{r.seller_phone}</td>
                  {/* 前日买入价 */}
                  <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap text-muted-foreground">
                    {r.original_price > 0 ? `¥${r.original_price.toFixed(2)}` : '-'}
                  </td>
                  {/* 今日卖出价 */}
                  <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap font-medium text-primary">
                    ¥{r.amount.toFixed(2)}
                  </td>
                  {/* 今日买入价 */}
                  <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap">
                    {r.consignment_price > 0 ? `¥${r.consignment_price.toFixed(2)}` : '-'}
                  </td>
                  {/* 转拍上架费 */}
                  <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap text-orange-600 dark:text-orange-400">
                    ¥{resellFee.toFixed(2)}
                  </td>
                  {/* 差额 */}
                  <td className={`px-3 py-2.5 text-xs font-mono whitespace-nowrap font-medium ${diff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                    {diff >= 0 ? '+' : ''}¥{diff.toFixed(2)}
                  </td>
                  {/* 直接奖励：从 referral_rewards 取，含老板作为推荐奖励接收人的情况 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {r.direct_reward > 0
                      ? <span className="font-mono text-green-600 dark:text-green-400 font-medium">¥{r.direct_reward.toFixed(2)}</span>
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                  {/* 代金券消耗 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-center">
                    {r.coupon_count > 0
                      ? <Badge variant="secondary" className="text-[11px] px-1.5">{r.coupon_count} 张</Badge>
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                  {/* 状态 */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="text-xs px-1.5 py-0.5 rounded-sm border border-border text-muted-foreground">
                      {STATUS_LABEL_MAP[r.status] ?? r.status}
                    </span>
                  </td>
                  {/* 下单时间 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                  {/* 完成时间 */}
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {r.completed_at ? new Date(r.completed_at).toLocaleString('zh-CN', { hour12: false }) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
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
