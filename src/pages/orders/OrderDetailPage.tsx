import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import AdminLayout from '@/components/layouts/AdminLayout';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import type { Order, OrderStatusLog } from '@/types/types';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [logs, setLogs] = useState<OrderStatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function fetch() {
      setLoading(true);
      const [orderRes, logsRes] = await Promise.all([
        supabase.from('orders').select('*, buyer:buyer_id(phone,nickname), seller:seller_id(phone,nickname), product:product_id(title,images)').eq('id', id).maybeSingle(),
        supabase.from('order_status_logs').select('*').eq('order_id', id).order('created_at', { ascending: true }).limit(50),
      ]);
      setOrder(orderRes.data ?? null);
      setLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      setNote(orderRes.data?.admin_note ?? '');
      setLoading(false);
    }
    fetch();
  }, [id]);

  async function handleSaveNote() {
    if (!order) return;
    setSaving(true);
    const { error } = await supabase.from('orders').update({ admin_note: note }).eq('id', order.id);
    setSaving(false);
    if (error) { toast.error('保存失败'); return; }
    toast.success('备注已保存');
  }

  async function handleMarkDisputed() {
    if (!order) return;
    const { error } = await supabase.from('orders').update({ status: 'disputed' }).eq('id', order.id);
    if (error) { toast.error('操作失败'); return; }
    await supabase.from('order_status_logs').insert({
      order_id: order.id, from_status: order.status, to_status: 'disputed', operator_type: 'admin', remark: '管理员标记争议'
    });
    toast.success('已标记为争议订单');
    navigate('/orders');
  }

  const INFO_ITEMS = order ? [
    { label: '订单号', value: order.order_no, mono: true },
    { label: '订单金额', value: `¥${Number(order.amount).toFixed(2)}`, highlight: true },
    { label: '买方手机', value: (order.buyer as any)?.phone ?? '-', mono: true },
    { label: '卖方手机', value: (order.seller as any)?.phone ?? '-', mono: true },
    { label: '商品名称', value: (order.product as any)?.title ?? '-' },
    { label: '创建时间', value: new Date(order.created_at).toLocaleString('zh-CN') },
    { label: '付款时间', value: order.payment_time ? new Date(order.payment_time).toLocaleString('zh-CN') : '-' },
    { label: '完成时间', value: order.completed_at ? new Date(order.completed_at).toLocaleString('zh-CN') : '-' },
  ] : [];

  const STATUS_OP_MAP: Record<string, string> = {
    system: '系统', buyer: '买方', seller: '卖方', admin: '管理员',
  };

  if (loading) return <AdminLayout><div className="py-20 text-center text-xs text-muted-foreground">加载中...</div></AdminLayout>;
  if (!order) return <AdminLayout><div className="py-20 text-center text-xs text-muted-foreground">订单不存在</div></AdminLayout>;

  return (
    <AdminLayout>
      <PageHeader title="订单详情"
        action={<Button variant="ghost" size="sm" onClick={() => navigate('/orders')} className="h-8 text-xs border border-border gap-1"><ArrowLeft size={13} />返回列表</Button>} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 主信息 */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">基本信息</h3>
              <StatusBadge status={order.status} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {INFO_ITEMS.map(item => (
                <div key={item.label}>
                  <p className="text-xs text-muted-foreground mb-0.5">{item.label}</p>
                  <p className={`text-xs ${item.mono ? 'font-mono' : ''} ${item.highlight ? 'text-primary font-medium text-sm' : 'text-foreground'}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            {order.cancel_reason && (
              <div className="mt-3 p-2 bg-muted/50 border border-border rounded-sm">
                <p className="text-xs text-muted-foreground">取消原因：{order.cancel_reason}</p>
              </div>
            )}
          </div>

          {/* 付款凭证 */}
          <div className="bg-card border border-border rounded-sm p-4">
            <h3 className="text-sm font-medium mb-3">付款凭证</h3>
            {order.payment_voucher_url ? (
              <a href={order.payment_voucher_url} target="_blank" rel="noopener noreferrer">
                <img src={order.payment_voucher_url} alt="付款凭证" className="max-w-sm w-full rounded-sm border border-border object-contain" />
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">买方尚未上传付款凭证</p>
            )}
          </div>

          {/* 管理员备注 */}
          <div className="bg-card border border-border rounded-sm p-4">
            <h3 className="text-sm font-medium mb-3">管理员备注</h3>
            <div className="space-y-2">
              <Textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="添加备注（仅管理员可见）" className="text-xs bg-muted border-border resize-none min-h-20" />
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveNote} disabled={saving} className="h-7 px-3 text-xs">
                  {saving ? '保存中...' : '保存备注'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：状态流转 + 操作 */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-sm p-4">
            <h3 className="text-sm font-medium mb-3">状态流转记录</h3>
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无记录</p>
              ) : logs.map((log, i) => (
                <div key={log.id} className={`text-xs ${i < logs.length - 1 ? 'pb-2 border-b border-border' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground">
                      {log.from_status ? `${log.from_status} → ` : ''}<span className="text-primary">{log.to_status}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">{STATUS_OP_MAP[log.operator_type]}</span>
                  </div>
                  {log.remark && <p className="text-muted-foreground mt-0.5">{log.remark}</p>}
                  <p className="text-muted-foreground mt-0.5">
                    {new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 操作区 */}
          {order.status !== 'disputed' && order.status !== 'completed' && order.status !== 'cancelled' && (
            <div className="bg-card border border-border rounded-sm p-4">
              <h3 className="text-sm font-medium mb-3">处理操作</h3>
              <Button variant="ghost" size="sm" onClick={handleMarkDisputed}
                className="w-full h-8 text-xs border border-warning/40 text-warning hover:bg-warning/10 gap-2">
                <AlertTriangle size={13} />标记为争议订单
              </Button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
