import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';

interface CommissionRecord {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  related_order_id: string | null;
  order_no?: string;
  order_amount?: number;
  buyer_name?: string;
  buyer_phone?: string;
  seller_name?: string;
  seller_phone?: string;
}

// account_transactions.type → 中文标签
const TYPE_LABEL: Record<string, string> = {
  in:           '推广佣金',
  commission:   '推广佣金',
  order_income: '推广佣金',
};

export default function MCommissionsPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    if (!mobileUser) { setLoading(false); return; }
    setLoading(true);

    (async () => {
      // 1. 查推广账户所有收入明细
      const { data: txData } = await supabase
        .from('account_transactions')
        .select('id,type,amount,description,created_at,related_order_id')
        .eq('user_id', mobileUser.id)
        .eq('account_type', 'promotion')
        .order('created_at', { ascending: false })
        .limit(100);

      const list = (txData ?? []) as CommissionRecord[];

      // 2. 批量查关联订单的买卖双方真实姓名和手机号
      const orderIds = [...new Set(list.map(r => r.related_order_id).filter(Boolean))] as string[];
      const orderMap: Record<string, Pick<CommissionRecord, 'order_no' | 'order_amount' | 'buyer_name' | 'buyer_phone' | 'seller_name' | 'seller_phone'>> = {};

      if (orderIds.length > 0) {
        const { data: ordData } = await supabase
          .from('orders')
          .select(`
            id, order_no, amount,
            buyer:users!orders_buyer_id_fkey(real_name, nickname, phone),
            seller:users!orders_seller_id_fkey(real_name, nickname, phone)
          `)
          .in('id', orderIds);

        (ordData ?? []).forEach((o: any) => {
          orderMap[o.id] = {
            order_no:     o.order_no ?? '',
            order_amount: Number(o.amount ?? 0),
            buyer_name:   o.buyer?.real_name  || o.buyer?.nickname  || '-',
            buyer_phone:  o.buyer?.phone  ?? '-',
            seller_name:  o.seller?.real_name || o.seller?.nickname || '-',
            seller_phone: o.seller?.phone ?? '-',
          };
        });
      }

      const enriched = list.map(r => ({
        ...r,
        ...(r.related_order_id ? orderMap[r.related_order_id] ?? {} : {}),
      }));

      setRecords(enriched);
      setTotalAmount(enriched.reduce((s, r) => s + Number(r.amount), 0));
      setLoading(false);
    })();
  }, [mobileUser?.id]);

  if (!mobileUser) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Button onClick={() => navigate('/m/login')}>请先登录</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="推广佣金明细" back />

      {/* 汇总卡 */}
      <div className="px-4 pt-4 pb-2">
        <div
          className="rounded-2xl px-5 py-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' }}
        >
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute right-8 top-8 w-14 h-14 rounded-full bg-white/10 pointer-events-none" />
          <p className="text-white/80 text-xs mb-1">累计推广佣金</p>
          {loading
            ? <Skeleton className="h-9 w-36 bg-white/20" />
            : <p className="text-white text-3xl font-bold tracking-wide">¥{totalAmount.toFixed(2)}</p>
          }
          <p className="text-white/60 text-xs mt-2">共 {records.length} 笔记录</p>
        </div>
      </div>

      {/* 明细列表 */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">佣金记录</span>
          <div className="h-0.5 w-8 rounded-full bg-primary" />
        </div>

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无推广佣金记录</p>
            <p className="text-xs mt-1">推荐好友成交后，佣金自动发放到此账户</p>
          </div>
        ) : (
          records.map(r => {
            const typeLabel = TYPE_LABEL[r.type] ?? r.type ?? '推广佣金';
            const hasBuyer  = r.buyer_name  && r.buyer_name  !== '-';
            const hasSeller = r.seller_name && r.seller_name !== '-';
            return (
              <div key={r.id} className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* 标题行 */}
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-primary">{typeLabel}</p>
                      {r.order_no && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {r.order_no}
                        </span>
                      )}
                    </div>

                    {/* 订单金额 */}
                    {r.order_amount && r.order_amount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        订单成交额：<span className="text-foreground font-medium">¥{r.order_amount.toFixed(2)}</span>
                      </p>
                    )}

                    {/* 买卖双方信息 */}
                    {(hasSeller || hasBuyer) && (
                      <div className="mt-1 space-y-1">
                        {hasSeller && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/90 text-white shrink-0">卖家</span>
                            <span className="text-xs text-foreground font-medium">{r.seller_name}</span>
                            {r.seller_phone && r.seller_phone !== '-' && (
                              <span className="text-xs text-muted-foreground">{r.seller_phone}</span>
                            )}
                          </div>
                        )}
                        {hasBuyer && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white shrink-0">买家</span>
                            <span className="text-xs text-foreground font-medium">{r.buyer_name}</span>
                            {r.buyer_phone && r.buyer_phone !== '-' && (
                              <span className="text-xs text-muted-foreground">{r.buyer_phone}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 备注 */}
                    {r.description && !hasBuyer && !hasSeller && (
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    )}

                    {/* 时间 */}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString('zh-CN', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {/* 金额 */}
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold text-blue-600">+¥{Number(r.amount).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
