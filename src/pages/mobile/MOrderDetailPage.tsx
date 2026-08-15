import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, User, Copy } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';

interface Order {
  id: string;
  order_no: string;
  amount: number;
  status: string;
  payment_voucher_url: string | null;
  payment_time: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  buyer_id: string;
  seller_id: string;
  products: { id: string; title: string; images: string[]; description: string | null } | null;
  buyer: { real_name: string; nickname: string; phone: string } | null;
  seller: { real_name: string; nickname: string; phone: string } | null;
}

interface StatusLog {
  id: string;
  from_status: string | null;
  to_status: string;
  operator_type: string;
  created_at: string;
  remark: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending_payment: { label: '待付款', color: 'text-destructive' },
  payment_uploaded: { label: '付款待确认', color: 'text-warning' },
  confirmed: { label: '已确认', color: 'text-info' },
  completed: { label: '已完成', color: 'text-success' },
  cancelled: { label: '已取消', color: 'text-muted-foreground' },
  disputed: { label: '争议中', color: 'text-destructive' },
};

export default function MOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [logs, setLogs] = useState<StatusLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    Promise.all([
      supabase.from('orders')
        .select('id,order_no,amount,status,payment_voucher_url,payment_time,confirmed_at,completed_at,created_at,updated_at,buyer_id,seller_id,products!orders_product_id_fkey(id,title,images,description),buyer:users!buyer_id(real_name,nickname,phone),seller:users!seller_id(real_name,nickname,phone)')
        .eq('id', id).maybeSingle(),
      supabase.from('order_status_logs').select('id,from_status,to_status,operator_type,created_at,remark').eq('order_id', id).order('created_at'),
    ]).then(([ord, lgRes]) => {
      setOrder(ord.data as Order | null);
      setLogs(lgRes.data ?? []);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [id]);

  const copyOrderNo = () => {
    if (order) navigator.clipboard.writeText(order.order_no).then(() => toast.success('订单号已复制'));
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="" back />
      <div className="p-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-32" /><Skeleton className="h-20" /></div>
    </div>
  );

  if (!order) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">订单不存在</div>;

  const isBuyer = mobileUser?.id === order.buyer_id;
  const isSeller = mobileUser?.id === order.seller_id;
  const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, color: '' };
  const img = order.products && Array.isArray(order.products.images) && order.products.images.length > 0 ? order.products.images[0] : null;

  const fmtTime = (t: string) => t.replace('T', ' ').replace('Z', '').slice(0, 23);

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <MobileHeader title="订单详情" back right={
        <button onClick={load} className="text-sm text-primary font-medium px-2">刷新</button>
      } />

      <div className="px-4 py-4 space-y-3">
        {/* 状态标题居中 */}
        <div className="text-center py-3">
          <p className={`text-xl font-bold ${statusInfo.color}`}>{statusInfo.label}</p>
        </div>

        {/* 商品信息 */}
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">商品信息</p>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">商品名称</span>
              <span className="text-sm text-foreground text-right max-w-[60%] break-words">{order.products?.title ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">金额</span>
              <span className="text-sm font-bold text-destructive">¥{Number(order.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* 订单信息 */}
        <div className="bg-card rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">订单信息</p>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: '卖家姓名', value: order.seller?.real_name ?? order.seller?.nickname ?? '—' },
              { label: '买家姓名', value: order.buyer?.real_name ?? order.buyer?.nickname ?? '—' },
              { label: '订单编号', value: order.order_no, mono: true, action: (
                <button onClick={copyOrderNo} className="ml-1.5 text-muted-foreground shrink-0">
                  <Copy size={13} />
                </button>
              )},
              { label: '创建时间', value: fmtTime(order.created_at), mono: true },
              { label: '更新时间', value: order.updated_at ? fmtTime(order.updated_at) : '—', mono: true, highlight: true },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 gap-2">
                <span className={`text-sm shrink-0 ${row.highlight ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{row.label}</span>
                <div className="flex items-center justify-end flex-1 min-w-0">
                  <span className={`text-sm text-right break-all ${row.mono ? 'font-mono text-xs text-muted-foreground' : 'text-foreground'}`}>{row.value}</span>
                  {row.action}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 付款凭证 */}
        {order.payment_voucher_url && (
          <div className="bg-card rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">付款凭证</h3>
            <img src={order.payment_voucher_url} alt="付款凭证" className="w-full rounded-lg max-h-48 object-contain bg-muted" />
          </div>
        )}

        {/* 状态流转 */}
        {logs.length > 0 && (
          <div className="bg-card rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">状态记录</h3>
            <div className="space-y-2">
              {logs.map((log, i) => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${i === logs.length - 1 ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                  <div>
                    <p className="text-xs text-foreground">{STATUS_MAP[log.to_status]?.label ?? log.to_status}</p>
                    <p className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('zh-CN')}</p>
                    {log.remark && <p className="text-xs text-muted-foreground">{log.remark}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border px-4 py-3 flex gap-2">
        {isBuyer && order.status === 'pending_payment' && (
          <Link to={`/m/payment/${order.id}`} className="flex-1">
            <Button className="w-full h-11">上传付款凭证</Button>
          </Link>
        )}
        {isSeller && order.status === 'payment_uploaded' && (
          <Link to={`/m/confirm/${order.id}`} className="flex-1">
            <Button className="w-full h-11">确认收款</Button>
          </Link>
        )}
        {(order.status === 'completed' || order.status === 'cancelled') && (
          <Button variant="outline" className="flex-1 h-11" onClick={() => navigate('/m/orders')}>返回订单列表</Button>
        )}
      </div>
    </div>
  );
}
