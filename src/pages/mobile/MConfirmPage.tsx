import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertCircle } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { toast } from 'sonner';
import { settleSellerEarnings } from '@/lib/settlement';
import { useSubmitLock } from '@/hooks/use-submit-lock';

export default function MConfirmPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { tryLock, unlock, isPending } = useSubmitLock();
  const submitting = isPending('confirm');

  useEffect(() => {
    if (!orderId) return;
    supabase.from('orders')
      .select('id,order_no,amount,status,payment_voucher_url,payment_time,product_id,buyer_id,buyer:users!buyer_id(real_name,nickname,phone,kyc_status),products!orders_product_id_fkey(id,title)')
      .eq('id', orderId).maybeSingle()
      .then(({ data }) => { setOrder(data); setLoading(false); });
  }, [orderId]);

  const handleConfirm = async () => {
    if (!tryLock('confirm')) return;
    try {
      // 1. 状态: payment_uploaded → confirmed（买方可操作库存）
      const { error } = await supabase.from('orders').update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
      }).eq('id', orderId);
      if (error) { toast.error('操作失败，请重试'); return; }

      // 2. 写状态流转日志
      await supabase.from('order_status_logs').insert({
        order_id: orderId, from_status: 'payment_uploaded', to_status: 'confirmed',
        operator_type: 'seller', operator_id: mobileUser?.id, remark: '卖方确认收款，商品已归入买方库存',
      });

      // 3. 结算卖方收益 + 分润分配（含直接奖励：推荐链路10点前递推，统一在此发放）
      await settleSellerEarnings({
        orderId: orderId!, sellerId: mobileUser!.id,
        buyerId: order.buyer_id,
        orderAmount: order.amount,
      });

      toast.success('已确认收款');
      navigate(`/m/order/${orderId}`);
    } finally {
      unlock('confirm');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="" back />
      <div className="p-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
    </div>
  );

  if (!order) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">订单不存在</div>;

  if (order.status !== 'payment_uploaded') return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="确认收款" back />
      <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
        <AlertCircle size={48} className="text-warning" />
        <p className="text-base font-semibold text-foreground">当前订单状态不可操作</p>
        <p className="text-sm text-muted-foreground">买方尚未上传付款凭证，请等待</p>
        <Button variant="outline" onClick={() => navigate(`/m/order/${orderId}`)}>查看订单</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <MobileHeader title="确认收款" back />

      <div className="px-4 py-6 space-y-4">
        {/* 订单信息 */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">订单号</span>
            <span className="text-foreground font-mono text-xs">{order.order_no}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">商品</span>
            <span className="text-foreground text-xs">{order.products?.title}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">买方</span>
            <span className="text-foreground">{order.buyer?.kyc_status === 'approved' && order.buyer?.real_name ? order.buyer.real_name : order.buyer?.nickname}（{order.buyer?.phone}）</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">应收金额</span>
            <span className="text-primary font-bold text-xl">¥{order.amount.toLocaleString()}</span>
          </div>
          {order.payment_time && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">买方付款时间</span>
              <span className="text-foreground text-xs">{new Date(order.payment_time).toLocaleString('zh-CN')}</span>
            </div>
          )}
        </div>

        {/* 付款凭证 */}
        {order.payment_voucher_url && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">买方付款凭证</h3>
            <img src={order.payment_voucher_url} alt="付款凭证" className="w-full rounded-lg max-h-64 object-contain bg-muted" />
          </div>
        )}

        {/* 确认提示 */}
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <AlertCircle size={14} className="text-warning" />确认前请核实
          </p>
          {[
            '请确认实际已收到买方转账的款项',
            '确认后交易将标记为完成，平台自动结算服务费',
            '如有问题请先与买方沟通，不要轻易确认',
          ].map((tip, i) => (
            <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="shrink-0">{i + 1}.</span>{tip}
            </p>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border px-4 py-3 flex gap-2">
        <Button variant="outline" className="flex-1 h-12" onClick={() => navigate(`/m/order/${orderId}`)}>暂不确认</Button>
        <Button className="flex-1 h-12" onClick={handleConfirm} disabled={submitting}>
          <CheckCircle size={16} className="mr-2" />
          {submitting ? '处理中...' : '确认已收款'}
        </Button>
      </div>
    </div>
  );
}
