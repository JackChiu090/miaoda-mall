import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { useMobileUser } from '@/contexts/MobileUserContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, RotateCcw, Gift, Info } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import { Link } from 'react-router-dom';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
  account_type: string;
  related_order_id: string | null;
  order?: {
    order_no: string;
    amount: number;
    buyer?: { real_name: string | null; nickname: string | null; phone: string; kyc_status: string } | null;
  } | null;
}

const TYPE_MAP: Record<string, { label: string; isIn: boolean }> = {
  commission:     { label: '发放', isIn: true },
  in:             { label: '发放', isIn: true },
  recharge:       { label: '充值', isIn: true },
  withdraw:       { label: '提现', isIn: false },
  out:            { label: '支出', isIn: false },
  freeze:         { label: '冻结', isIn: false },
  unfreeze:       { label: '解冻', isIn: true },
  order_income:   { label: '发放', isIn: true },
  fee:            { label: '服务费', isIn: false },
  points_exchange:{ label: '代金券兑换', isIn: false },
};

const ACCOUNT_TYPES = [
  { value: 'all',       label: '全部账户' },
  { value: 'bonus',     label: '奖金账户' },
  { value: 'promotion', label: '推广账户' },
  { value: 'points',    label: '代金券账户' },
  { value: 'coupon',    label: '优惠券账户' },
];

const PAGE_TITLE: Record<string, string> = {
  bonus:     '奖金明细',
  coupon:    '优惠券明细',
  promotion: '推广奖金明细',
  points:    '代金券明细',
  all:       '资金明细',
};

// 格式化日期为 YYYY-MM-DD
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 获取某月第一天/最后一天
function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export default function MWalletDetailPage() {
  const { mobileUser } = useMobileUser();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const initType = sp.get('type') ?? 'all';
  const [accountType, setAccountType] = useState(initType);
  const pageTitle = PAGE_TITLE[accountType] ?? '资金明细';
  const isBonusMode = accountType === 'bonus';

  // 日期范围（按月切换）
  const now = new Date();
  const [rangeYear, setRangeYear]   = useState(now.getFullYear());
  const [rangeMonth, setRangeMonth] = useState(now.getMonth()); // 0-indexed

  const { start: rangeStart, end: rangeEnd } = monthRange(rangeYear, rangeMonth);
  const rangeLabel = `${fmtDate(rangeStart)} - ${fmtDate(rangeEnd)}`;

  // 账户余额（所有支持余额卡的账户）
  const [accountBalance, setAccountBalance] = useState<number | null>(null);

  // 明细列表
  const [txns, setTxns]       = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // 统计（收入/支出）
  const totalIn  = txns.filter(t => (TYPE_MAP[t.type]?.isIn ?? t.amount > 0)).reduce((s, t) => s + t.amount, 0);
  const totalOut = txns.filter(t => !(TYPE_MAP[t.type]?.isIn ?? t.amount > 0)).reduce((s, t) => s + t.amount, 0);

  // 拉取对应账户余额（非 all 模式都显示）
  useEffect(() => {
    if (!mobileUser || accountType === 'all') { setAccountBalance(null); return; }
    supabase.from('virtual_accounts')
      .select('balance')
      .eq('user_id', mobileUser.id)
      .eq('account_type', accountType)
      .maybeSingle()
      .then(({ data }) => setAccountBalance(data?.balance ?? 0));
  }, [mobileUser?.id, accountType]);

  // 拉取明细
  const fetchTxns = useCallback(async () => {
    if (!mobileUser) { setLoading(false); return; }
    setLoading(true);
    let q = supabase
      .from('account_transactions')
      .select(`
        id, type, amount, balance_after, description, created_at, account_type, related_order_id,
        order:orders!account_transactions_related_order_id_fkey(
          order_no, amount,
          buyer:users!orders_buyer_id_fkey(real_name, nickname, phone, kyc_status)
        )
      `)
      .eq('user_id', mobileUser.id)
      .gte('created_at', rangeStart.toISOString())
      .lte('created_at', rangeEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    if (accountType !== 'all') q = q.eq('account_type', accountType);
    const { data } = await q;
    setTxns((data as any[]) ?? []);
    setLoading(false);
  }, [mobileUser?.id, accountType, rangeYear, rangeMonth]);

  useEffect(() => { fetchTxns(); }, [fetchTxns]);

  // 月份切换
  const prevMonth = () => {
    if (rangeMonth === 0) { setRangeYear(y => y - 1); setRangeMonth(11); }
    else setRangeMonth(m => m - 1);
  };
  const nextMonth = () => {
    const today = new Date();
    if (rangeYear > today.getFullYear() || (rangeYear === today.getFullYear() && rangeMonth >= today.getMonth())) return;
    if (rangeMonth === 11) { setRangeYear(y => y + 1); setRangeMonth(0); }
    else setRangeMonth(m => m + 1);
  };
  const resetMonth = () => { setRangeYear(now.getFullYear()); setRangeMonth(now.getMonth()); };

  const isCurrentMonth = rangeYear === now.getFullYear() && rangeMonth === now.getMonth();

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title={pageTitle} back
        right={
          <Select value={accountType} onValueChange={v => { setAccountType(v); }}>
            <SelectTrigger className="h-8 text-xs w-24 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <div className="px-4 pt-4 pb-6 space-y-4">

        {/* 余额卡（非 all 模式显示，每种账户独立配色） */}
        {accountType !== 'all' && (() => {
          const cardConfig: Record<string, { label: string; gradient: string }> = {
            bonus:     { label: '我的奖金',   gradient: 'linear-gradient(135deg, #3d9e5c 0%, #e07b2a 100%)' },
            promotion: { label: '推广奖金',   gradient: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' },
            points:    { label: '代金券余额', gradient: 'linear-gradient(135deg, #d97706 0%, #dc2626 100%)' },
            coupon:    { label: '优惠券余额', gradient: 'linear-gradient(135deg, #0891b2 0%, #0d9488 100%)' },
          };
          const cfg = cardConfig[accountType] ?? { label: pageTitle, gradient: 'linear-gradient(135deg, #374151 0%, #111827 100%)' };
          return (
            <div
              className="rounded-2xl px-5 py-5 relative overflow-hidden"
              style={{ background: cfg.gradient }}
            >
              <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
              <div className="absolute right-8 top-8 w-14 h-14 rounded-full bg-white/10 pointer-events-none" />
              <p className="text-white/90 text-sm font-medium mb-1">{cfg.label}</p>
              <p className="text-white text-3xl font-bold tracking-wide">
                ¥{accountBalance !== null ? accountBalance.toFixed(2) : '—'}
              </p>
            </div>
          );
        })()}

        {/* 代金券储备说明卡（仅 points 模式） */}
        {accountType === 'points' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Info size={13} className="text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-700">代金券储备说明</p>
            </div>
            <ul className="text-xs text-amber-700 space-y-1 leading-relaxed">
              <li>• 每笔完成订单按<span className="font-semibold">交易额 0.1%</span>自动存入，无需手动操作</li>
              <li>• 累积至 <span className="font-semibold">¥3,980</span> 且直推满 3 人，可申请兑换实物代金券</li>
              <li>• 兑换后代金券存入"优惠券账户"，可在购物时抵扣使用</li>
              <li>• 储备积分长期有效，无过期时间</li>
            </ul>
            <Link
              to="/m/exchange"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 underline underline-offset-2"
            >
              <Gift size={12} />
              前往兑换商城
            </Link>
          </div>
        )}

        {/* 日期范围选择器 */}
        <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-2.5">
          <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors">
            <ChevronLeft size={16} className="text-muted-foreground" />
          </button>
          <span className="text-xs text-foreground font-medium">{rangeLabel}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={nextMonth}
              disabled={isCurrentMonth}
              className="p-1 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors disabled:opacity-30"
            >
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
            <button onClick={resetMonth} className="p-1 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors ml-1">
              <RotateCcw size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* 统计栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{pageTitle}</span>
            <div className="h-0.5 w-10 rounded-full bg-primary" />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>收入：<span className="text-success font-medium">¥{totalIn.toFixed(2)}</span></span>
            <span>支出：<span className="text-foreground font-medium">¥{totalOut.toFixed(2)}</span></span>
          </div>
        </div>

        {/* 明细列表 */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : txns.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-sm">暂无明细记录</p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-border">
            {txns.map(t => {
              const info    = TYPE_MAP[t.type] ?? { label: t.type, isIn: t.amount > 0 };
              const order   = t.order as any;
              const buyerName = (order?.buyer?.kyc_status === 'approved' && order?.buyer?.real_name) ? order.buyer.real_name : (order?.buyer?.nickname || order?.buyer?.phone?.slice(-4) || '');
              const orderNo   = order?.order_no ?? '';
              const orderAmt  = order?.amount ?? 0;

              return (
                <div key={t.id} className="py-3.5 first:pt-0">
                  {/* 行1：类型 + 金额 */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{info.label}</span>
                    <span className={`text-base font-bold ${info.isIn ? 'text-foreground' : 'text-destructive'}`}>
                      {info.isIn ? '' : '-'}¥{Math.abs(t.amount).toFixed(2)}
                    </span>
                  </div>

                  {/* 行2：描述 / 关联订单信息 */}
                  {(buyerName || orderNo || t.description) && (
                    <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground mb-0.5">
                      {buyerName && <span>买家姓名：{buyerName}</span>}
                      {orderNo && (
                        <>
                          {buyerName && <span>订单号：</span>}
                          <span className="text-primary break-all">{orderNo}</span>
                          {orderAmt > 0 && <span>订单成交额：</span>}
                        </>
                      )}
                      {!orderNo && t.description && (
                        <span className="text-muted-foreground">{t.description}</span>
                      )}
                    </div>
                  )}

                  {/* 行3：关联订单金额（绿色） */}
                  {orderAmt > 0 && (
                    <p className="text-xs text-success font-medium mb-0.5">
                      ¥{Number(orderAmt).toFixed(2)}
                    </p>
                  )}

                  {/* 行4：时间 */}
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString('zh-CN', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
